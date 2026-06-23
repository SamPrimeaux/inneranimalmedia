#!/usr/bin/env bash
# Install FreeCAD AppImage on Linux (GCP iam-tunnel / ExecOS CAD host).
#
# Usage (on VM or via gcloud):
#   bash scripts/designstudio/install-freecad-appimage.sh /path/to/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage
#
# Remote install from Mac (repo root) — uploads ~800MB via SCP (flaky on bad uplink):
#   ./scripts/designstudio/install-freecad-appimage.sh --remote ~/Downloads/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage
#
# Remote install WITHOUT Mac upload (recommended when Cox/SCP keeps stalling):
#   export GCP_PROJECT_ID=gen-lang-client-0684066529 GCP_ZONE=us-central1-f
#   ./scripts/designstudio/install-freecad-appimage.sh --remote-download
#
# Install only (AppImage already on VM at /tmp/FreeCAD.AppImage.upload):
#   ./scripts/designstudio/install-freecad-appimage.sh --remote-install-only
#
# Recommended headless install on iam-tunnel (apt 0.20.x, replaces broken AppImage wrapper):
#   ./scripts/designstudio/install-freecad-appimage.sh --remote-apt
#
# On-VM only (Console SSH):
#   INSTALL_APT_ON_HOST=1 bash scripts/designstudio/install-freecad-appimage.sh
set -euo pipefail

SCRIPT_SELF="${BASH_SOURCE[0]:-}"  # safe: :-"" prevents -u from firing on stdin pipe
if [[ -n "$SCRIPT_SELF" && -f "$SCRIPT_SELF" ]]; then
  REPO_ROOT="$(cd "$(dirname "$SCRIPT_SELF")/../.." && pwd)"
  INSTALL_SCRIPT="$SCRIPT_SELF"
else
  REPO_ROOT="${REPO_ROOT:-$(pwd)}"
  INSTALL_SCRIPT="${INSTALL_SCRIPT:-$REPO_ROOT/scripts/designstudio/install-freecad-appimage.sh}"
fi

REMOTE=0
REMOTE_DOWNLOAD=0
REMOTE_INSTALL_ONLY=0
REMOTE_APT=0
SKIP_VERIFY=0
APPIMAGE=""
FREECAD_APPIMAGE_URL="${FREECAD_APPIMAGE_URL:-https://github.com/FreeCAD/FreeCAD/releases/download/1.1.1/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage}"
FREECAD_APPIMAGE_SHA256_URL="${FREECAD_APPIMAGE_SHA256_URL:-https://github.com/FreeCAD/FreeCAD/releases/download/1.1.1/FreeCAD_1.1.1-Linux-x86_64-py311.AppImage-SHA256.txt}"
REMOTE_APPIMAGE_PATH="${REMOTE_APPIMAGE_PATH:-/tmp/FreeCAD.AppImage.upload}"

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
    --remote-download) REMOTE_DOWNLOAD=1 ;;
    --remote-install-only) REMOTE_INSTALL_ONLY=1 ;;
    --remote-apt) REMOTE_APT=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) APPIMAGE="$arg" ;;
  esac
done

resolve_gcp() {
  GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
  GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  GCP_ZONE="${GCP_ZONE:-}"
  if [[ -z "$GCP_ZONE" && -n "$GCP_PROJECT_ID" ]]; then
    GCP_ZONE="$(gcloud compute instances list --project="$GCP_PROJECT_ID" --filter="name=$GCP_VM_NAME" --format='value(zone)' 2>/dev/null | head -1)"
  fi
  if [[ -z "$GCP_PROJECT_ID" || -z "$GCP_ZONE" ]]; then
    echo "Set GCP_PROJECT_ID and GCP_ZONE (or gcloud default project + resolvable zone)." >&2
    exit 1
  fi
}

ensure_linux_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    return 0
  fi
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    fuse libfuse2 xvfb curl ca-certificates \
    libxcb-cursor0 libxcb-xinerama0 libx11-xcb1 libdbus-1-3 \
    libegl1 libgl1 libglib2.0-0 \
    >/dev/null 2>&1 || true
}

kill_freecad_zombies() {
  sudo pkill -9 -f 'FreeCAD.AppImage' 2>/dev/null || true
  sudo pkill -9 -f 'mount_FreeCA' 2>/dev/null || true
  sudo pkill -9 -f '/tmp/.mount_FreeCA' 2>/dev/null || true
  sudo pkill -9 -f 'Xvfb :' 2>/dev/null || true
}

resolve_apt_freecad_bin() {
  local c
  for c in /usr/lib/freecad/bin/freecadcmd-python3 /usr/bin/freecadcmd /usr/bin/FreeCADCmd; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

write_freecad_wrapper() {
  local fc_bin="$1"
  sudo tee /usr/local/bin/FreeCADCmd >/dev/null <<WRAP
#!/usr/bin/env bash
export QT_QPA_PLATFORM="\${QT_QPA_PLATFORM:-offscreen}"
export QT_LOGGING_RULES="\${QT_LOGGING_RULES:-*=false}"
FC_BIN="$fc_bin"
if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a -s "-screen 0 1280x720x24 +extension GLX" env QT_QPA_PLATFORM="\$QT_QPA_PLATFORM" "\$FC_BIN" "\$@"
fi
exec env QT_QPA_PLATFORM="\$QT_QPA_PLATFORM" "\$FC_BIN" "\$@"
WRAP
  sudo chmod 755 /usr/local/bin/FreeCADCmd
  sudo ln -sf /usr/local/bin/FreeCADCmd /usr/local/bin/freecadcmd
}

remove_appimage_install() {
  kill_freecad_zombies
  if [[ -f /opt/freecad/FreeCAD.AppImage ]]; then
    sudo mv /opt/freecad/FreeCAD.AppImage "/opt/freecad/FreeCAD.AppImage.bak.$(date +%s)" 2>/dev/null || \
      sudo rm -f /opt/freecad/FreeCAD.AppImage
    echo "Archived /opt/freecad/FreeCAD.AppImage (apt is now primary)."
  fi
}

install_apt_on_host() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "install_apt_on_host must run on Linux" >&2
    exit 1
  fi

  ensure_linux_deps
  sudo apt-get install -y -qq freecad freecad-python3

  local fc_bin
  fc_bin="$(resolve_apt_freecad_bin)" || {
    echo "freecadcmd not found after apt install" >&2
    exit 1
  }

  if [[ "${REMOVE_APPIMAGE:-1}" == "1" ]]; then
    remove_appimage_install
  fi

  write_freecad_wrapper "$fc_bin"

  sudo tee /etc/profile.d/freecad.sh >/dev/null <<'ENV'
export FREECAD_BIN=/usr/local/bin/FreeCADCmd
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
ENV

  verify_freecad_cmd /usr/local/bin/FreeCADCmd
  echo "OK: FreeCAD apt at ${fc_bin} (wrapper /usr/local/bin/FreeCADCmd)"
  echo "FREECAD_BIN=/usr/local/bin/FreeCADCmd"
}

verify_freecad_cmd() {
  local bin="$1"
  if [[ "${SKIP_VERIFY}" -eq 1 ]]; then
    echo "Skipping FreeCADCmd smoke ( --skip-verify )."
    return 0
  fi

  echo "Verifying ${bin} (Python smoke; do not use --version — it can SIGSEGV headless)…"
  local smoke="/tmp/freecad_install_smoke.py"
  printf '%s\n' 'print("freecad_smoke_ok")' > "$smoke"

  export QT_QPA_PLATFORM=offscreen
  export QT_LOGGING_RULES='*=false'
  local out=""
  if command -v timeout >/dev/null 2>&1; then
    if command -v xvfb-run >/dev/null 2>&1; then
      out="$(timeout 180 xvfb-run -a "$bin" "$smoke" 2>&1)" || {
        echo "FreeCADCmd smoke timed out after 180s (install files are still in place)." >&2
        echo "Retry later: echo 'print(1)' > /tmp/t.py && timeout 180 xvfb-run -a ${bin} /tmp/t.py" >&2
        return 1
      }
    else
      out="$(timeout 180 "$bin" "$smoke" 2>&1)" || {
        echo "FreeCADCmd smoke timed out after 180s." >&2
        return 1
      }
    fi
  else
    out="$("$bin" "$smoke" 2>&1)" || {
      echo "FreeCADCmd smoke failed." >&2
      return 1
    }
  fi

  echo "$out" | head -5
  if ! grep -q freecad_smoke_ok <<<"$out"; then
    echo "FreeCADCmd smoke unexpected output." >&2
    return 1
  fi
  echo "FreeCADCmd smoke OK"
}

install_on_host() {
  # When invoked via remote_run_install_on_vm, $1 is empty and path comes from env.
  local src="${1:-${REMOTE_APPIMAGE_PATH:-}}"
  if [[ -z "$src" ]]; then
    echo "AppImage path not provided (pass as arg or set REMOTE_APPIMAGE_PATH)" >&2
    exit 1
  fi
  if [[ ! -f "$src" ]]; then
    echo "AppImage not found: $src" >&2
    exit 1
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "install-freecad-appimage.sh must run on Linux (use --remote* from Mac)" >&2
    exit 1
  fi

  ensure_linux_deps

  sudo mkdir -p /opt/freecad
  sudo cp "$src" /opt/freecad/FreeCAD.AppImage
  sudo chmod 755 /opt/freecad/FreeCAD.AppImage

  sudo tee /usr/local/bin/FreeCADCmd >/dev/null <<'WRAP'
#!/usr/bin/env bash
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
export QT_LOGGING_RULES="${QT_LOGGING_RULES:-*=false}"
if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a -s "-screen 0 1280x720x24 +extension GLX" /opt/freecad/FreeCAD.AppImage FreeCADCmd "$@"
fi
exec /opt/freecad/FreeCAD.AppImage FreeCADCmd "$@"
WRAP
  sudo chmod 755 /usr/local/bin/FreeCADCmd
  sudo ln -sf /usr/local/bin/FreeCADCmd /usr/local/bin/freecadcmd

  sudo tee /etc/profile.d/freecad.sh >/dev/null <<'ENV'
export FREECAD_BIN=/usr/local/bin/FreeCADCmd
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
ENV

  verify_freecad_cmd /usr/local/bin/FreeCADCmd
  echo "OK: FreeCAD installed at /opt/freecad/FreeCAD.AppImage"
  echo "FREECAD_BIN=/usr/local/bin/FreeCADCmd"
}

remote_run_install_on_vm() {
  local appimage_path="$1"
  if [[ ! -f "$INSTALL_SCRIPT" ]]; then
    echo "Install script not found: $INSTALL_SCRIPT" >&2
    exit 1
  fi
  # Fix: "-- bash -s -- $path" passes $path as a gcloud positional arg, not to bash.
  # Solution: inline the path as an env assignment inside the quoted remote command string.
  gcloud compute ssh "$GCP_VM_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    -- "REMOTE_APPIMAGE_PATH=$(printf '%q' "$appimage_path") bash -s" \
    < "$INSTALL_SCRIPT"
}

remote_install_upload() {
  local local_appimage="$1"
  resolve_gcp

  echo "→ Uploading AppImage to ${GCP_VM_NAME} via SCP (~800MB — use --remote-download if this stalls)…"
  gcloud compute scp "$local_appimage" "${GCP_VM_NAME}:${REMOTE_APPIMAGE_PATH}" \
    --project="$GCP_PROJECT_ID" --zone="$GCP_ZONE" \
    --scp-flag="-o ServerAliveInterval=15" \
    --scp-flag="-o ServerAliveCountMax=240" \
    --scp-flag="-o TCPKeepAlive=yes" \
    --scp-flag="-C"

  echo "→ Installing on ${GCP_VM_NAME}…"
  remote_run_install_on_vm "$REMOTE_APPIMAGE_PATH"
  echo "Done. ExecOS CAD jobs can use engine=freecad on this VM."
}

remote_install_download() {
  resolve_gcp
  echo "→ Download + install on ${GCP_VM_NAME} (GitHub → VM, skips Mac uplink)…"
  gcloud compute ssh "$GCP_VM_NAME" --project="$GCP_PROJECT_ID" --zone="$GCP_ZONE" -- bash -s <<REMOTE
set -euo pipefail
dest="${REMOTE_APPIMAGE_PATH}"
FREECAD_APPIMAGE_URL="${FREECAD_APPIMAGE_URL}"
FREECAD_APPIMAGE_SHA256_URL="${FREECAD_APPIMAGE_SHA256_URL}"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl ca-certificates fuse libfuse2 xvfb libxcb-cursor0 >/dev/null 2>&1 || true
fi
if [[ ! -f "\${dest}" ]]; then
  echo "Downloading \${FREECAD_APPIMAGE_URL}"
  rm -f "\${dest}" "\${dest}.partial"
  curl -fL --retry 8 --retry-delay 5 --retry-all-errors --continue-at - \
    -o "\${dest}.partial" "\${FREECAD_APPIMAGE_URL}"
  mv "\${dest}.partial" "\${dest}"
else
  echo "Using existing \${dest} (\$(du -h "\${dest}" | awk '{print \$1}'))"
fi
if curl -fsSL "\${FREECAD_APPIMAGE_SHA256_URL}" -o /tmp/FreeCAD.AppImage.SHA256.txt 2>/dev/null; then
  expected="\$(awk '{print \$1}' /tmp/FreeCAD.AppImage.SHA256.txt | head -1)"
  actual="\$(sha256sum "\${dest}" | awk '{print \$1}')"
  if [[ "\${expected}" != "\${actual}" ]]; then
    echo "SHA256 mismatch" >&2
    exit 1
  fi
  echo "SHA256 OK"
fi
REMOTE
  echo "→ Installing on ${GCP_VM_NAME}…"
  remote_run_install_on_vm "$REMOTE_APPIMAGE_PATH"
  echo "Done. ExecOS CAD jobs can use engine=freecad on ${GCP_VM_NAME}."
}

remote_install_only() {
  resolve_gcp
  echo "→ Installing existing AppImage on ${GCP_VM_NAME} at ${REMOTE_APPIMAGE_PATH}…"
  remote_run_install_on_vm "$REMOTE_APPIMAGE_PATH"
  echo "Done. ExecOS CAD jobs can use engine=freecad on ${GCP_VM_NAME}."
}

remote_run_apt_on_vm() {
  if [[ ! -f "$INSTALL_SCRIPT" ]]; then
    echo "Install script not found: $INSTALL_SCRIPT" >&2
    exit 1
  fi
  gcloud compute ssh "$GCP_VM_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    -- "INSTALL_APT_ON_HOST=1 REMOVE_APPIMAGE=1 bash -s" \
    < "$INSTALL_SCRIPT"
}

remote_install_apt() {
  resolve_gcp
  echo "→ Installing FreeCAD via apt on ${GCP_VM_NAME} (replaces AppImage wrapper)…"
  remote_run_apt_on_vm
  echo "Done (apt). For 1.1.1 AppImage use --remote-download instead."
}

if [[ "${INSTALL_APT_ON_HOST:-}" == "1" ]]; then
  install_apt_on_host
  exit 0
fi

if [[ "$REMOTE_INSTALL_ONLY" -eq 1 ]]; then
  remote_install_only
elif [[ "$REMOTE_DOWNLOAD" -eq 1 ]]; then
  remote_install_download
elif [[ "$REMOTE_APT" -eq 1 ]]; then
  remote_install_apt
elif [[ "$REMOTE" -eq 1 ]]; then
  if [[ -z "$APPIMAGE" ]]; then
    echo "Usage: install-freecad-appimage.sh --remote /path/to/FreeCAD.AppImage" >&2
    exit 1
  fi
  remote_install_upload "$APPIMAGE"
else
  # Direct local install. When invoked remotely via bash -s + REMOTE_APPIMAGE_PATH env,
  # $APPIMAGE is empty but install_on_host falls back to $REMOTE_APPIMAGE_PATH.
  if [[ -z "$APPIMAGE" && -z "${REMOTE_APPIMAGE_PATH:-}" ]]; then
    echo "Usage: install-freecad-appimage.sh /path/to/FreeCAD.AppImage" >&2
    exit 1
  fi
  install_on_host "${APPIMAGE:-}"
fi
