#!/usr/bin/env bash
# Sam platform-operator lane — au_* ids allowed on terminal.inneranimalmedia.com
# and /home/samprimeaux/inneranimalmedia. Source from bootstrap / sync scripts.
#
#   source "$(dirname "$0")/lib/sam-operator-lane.sh"
#   require_sam_operator_lane_user_id "$IAM_USER_ID"

_SAM_OPERATOR_LANE_IDS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sam-operator-lane.ids"

sam_operator_lane_ids() {
  grep -E '^au_[a-f0-9]+$' "$_SAM_OPERATOR_LANE_IDS_FILE" 2>/dev/null || true
}

is_sam_operator_lane_user_id() {
  local uid="${1:-}"
  [[ -z "$uid" ]] && return 1
  grep -qx "$uid" "$_SAM_OPERATOR_LANE_IDS_FILE" 2>/dev/null
}

require_sam_operator_lane_user_id() {
  local uid="${1:-${IAM_USER_ID:-${AGENTSAM_USER_ID:-}}}"
  if is_sam_operator_lane_user_id "$uid"; then
    return 0
  fi
  echo "✗ Refusing: Sam operator lane required (au_* in scripts/lib/sam-operator-lane.ids)." >&2
  echo "  IAM_USER_ID=${IAM_USER_ID:-<unset>} AGENTSAM_USER_ID=${AGENTSAM_USER_ID:-<unset>}" >&2
  echo "  Connor and other users use sandboxterminal + /workspace/{tenant}/{user}/ only." >&2
  return 1
}
