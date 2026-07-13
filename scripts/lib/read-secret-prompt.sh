#!/usr/bin/env bash
# Interactive secret input — visible paste (default). Avoids silent hangs and bad clipboard reads.
#
# Usage:
#   read_secret_interactive "Anthropic API key"
#   KEY="$(read_secret_interactive "Anthropic API key")"
#
# Options via env:
#   READ_SECRET_MODE=visible|hidden|paste|stdin
#   READ_SECRET_ALLOW_EMPTY=1  (return empty instead of error)
read_secret_interactive() {
  local label="${1:-secret}"
  local mode="${READ_SECRET_MODE:-visible}"
  local val=""

  case "$mode" in
    paste)
      if ! command -v pbpaste >/dev/null 2>&1; then
        echo "ERROR: pbpaste not found — use READ_SECRET_MODE=visible" >&2
        return 1
      fi
      echo "→ Reading ${label} from clipboard (pbpaste)…"
      val="$(pbpaste)"
      ;;
    stdin)
      val="$(cat)"
      ;;
    hidden)
      echo ""
      echo "Paste ${label} only (raw value — no arrows/labels)."
      echo "Hidden input. Press Enter when done:"
      read -rs val
      echo ""
      ;;
    visible|*)
      echo ""
      echo "Paste ${label} only (raw value — no arrows/labels)."
      echo "Visible paste, then Enter:"
      read -r val
      ;;
  esac

  val="$(printf '%s' "$val" | sed $'s/\xEF\xBB\xBF//g' | tr -d '\r\n\t' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/^"//;s/"$//')"
  # API keys: strip accidental spaces; keep sk-ant-* charset
  if [[ "$label" == *"API"* || "$label" == *"KEY"* || "$label" == *"TOKEN"* ]]; then
    val="$(printf '%s' "$val" | tr -d '[:space:]')"
  fi
  if [[ -z "$val" && "${READ_SECRET_ALLOW_EMPTY:-0}" != "1" ]]; then
    echo "ERROR: empty value for ${label}" >&2
    return 1
  fi
  printf '%s' "$val"
}

# When sourced, define function only. When executed directly, run one prompt.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  read_secret_interactive "${1:-secret}"
fi
