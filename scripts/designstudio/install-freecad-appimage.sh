#!/usr/bin/env bash
# Install FreeCAD AppImage on Linux (GCP iam-tunnel / ExecOS CAD host).
#
# Usage (on VM or via gcloud):
#   bash scripts/designstudio/install-freecad-appimage.sh /path/to/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage
#
# Remote install from Mac (repo root):
#   ./scripts/designstudio/install-freecad-appimage.sh --remote ~/Downloads/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage
#
# Sets:
#   /opt/freecad/FreeCAD.AppImage
#   /usr/local/bin/FreeCADCmd  → AppImage FreeCADCmd (headless)
#   /usr/local/bin/freecadcmd  → same
# Appends FREECAD_BIN to /etc/profile.d/freecad.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE=0
APPIMAGE=""

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) APPIMAGE="$arg" ;;
  esac
done

install_on_host() {
  local src="$1"
  if [[ ! -f "$src" ]]; then
    echo "AppImage not found: $src" >&2
    exit 1
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "install-freecad-appimage.sh must run on Linux (use --remote from Mac)" >&2
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq fuse libfuse2 xvfb >/dev/null 2>&1 || true
  fi

  sudo mkdir -p /opt/freecad
  sudo cp "$src" /opt/freecad/FreeCAD.AppImage
  sudo chmod 755 /opt/freecad/FreeCAD.AppImage

  sudo tee /usr/local/bin/FreeCADCmd >/dev/null <<'WRAP'
#!/usr/bin/env bash
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
exec /opt/freecad/FreeCAD.AppImage FreeCADCmd "$@"
WRAP
  sudo chmod 755 /usr/local/bin/FreeCADCmd
  sudo ln -sf /usr/local/bin/FreeCADCmd /usr/local/bin/freecadcmd

  sudo tee /etc/profile.d/freecad.sh >/dev/null <<'ENV'
export FREECAD_BIN=/usr/local/bin/FreeCADCmd
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
ENV

  echo "Verifying FreeCADCmd…"
  /usr/local/bin/FreeCADCmd --version 2>&1 | head -3 || {
    echo "FreeCADCmd smoke failed — check fuse/AppImage on this host" >&2
    exit 1
  }
  echo "OK: FreeCAD installed at /opt/freecad/FreeCAD.AppImage"
  echo "FREECAD_BIN=/usr/local/bin/FreeCADCmd"
}

remote_install() {
  local local_appimage="$1"
  local vm="${GCP_VM_NAME:-iam-tunnel}"
  local project="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  local zone="${GCP_ZONE:-}"

  if ! command -v gcloud >/dev/null 2>&1; then
    echo "gcloud required for --remote" >&2
    exit 1
  fi
  if [[ -z "$zone" && -n "$project" ]]; then
    zone="$(gcloud compute instances list --project="$project" --filter="name=$vm" --format='value(zone)' 2>/dev/null | head -1)"
  fi
  if [[ -z "$project" || -z "$zone" ]]; then
    echo "Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
    exit 1
  fi

  echo "→ Uploading AppImage to ${vm}…"
  gcloud compute scp "$local_appimage" "${vm}:/tmp/FreeCAD.AppImage.upload" \
    --project="$project" --zone="$zone"

  echo "→ Installing on ${vm}…"
  gcloud compute ssh "$vm" --project="$project" --zone="$zone" --command \
    "bash -s" < "$REPO_ROOT/scripts/designstudio/install-freecad-appimage.sh" /tmp/FreeCAD.AppImage.upload

  echo "Done. ExecOS CAD jobs can use engine=freecad on this VM."
}

if [[ "$REMOTE" -eq 1 ]]; then
  if [[ -z "$APPIMAGE" ]]; then
    echo "Usage: install-freecad-appimage.sh --remote /path/to/FreeCAD.AppImage" >&2
    exit 1
  fi
  remote_install "$APPIMAGE"
else
  if [[ -z "$APPIMAGE" ]]; then
    echo "Usage: install-freecad-appimage.sh /path/to/FreeCAD.AppImage" >&2
    exit 1
  fi
  install_on_host "$APPIMAGE"
fi
