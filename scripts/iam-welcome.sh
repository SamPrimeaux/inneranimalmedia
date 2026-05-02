#!/usr/bin/env bash
# =============================================================
# iam-welcome.sh  —  InnerAnimal Media  |  Terminal Splash
# =============================================================
# INSTALL (one-time):
#   cp scripts/iam-welcome.sh ~/iam-welcome.sh   # from repo root
#   chmod +x ~/iam-welcome.sh
#   echo '\n# IAM splash\n[[ -f ~/iam-welcome.sh ]] && source ~/iam-welcome.sh' >> ~/.zshrc
#
# OPTIONAL: run standalone anytime with:
#   bash ~/iam-welcome.sh
# =============================================================

# Skip in non-interactive shells
[[ $- != *i* ]] && return 0

# ── Color palette ────────────────────────────────────────────
RS='\e[0m'
CY='\e[1;36m'          # bright cyan       → box border
YL='\e[1;33m'          # bright yellow     → menu numbers, prompt
OR='\e[38;5;208m'      # orange            → brand name
WH='\e[1;37m'          # bright white      → menu text
GN='\e[38;5;34m'       # green             → vines
BL='\e[38;5;17m'       # dark navy         → gorilla body
MB='\e[38;5;67m'       # slate blue        → gorilla shading
LB='\e[1;36m'          # bright cyan       → gorilla eyes
RD='\e[38;5;160m'      # red               → fire base
YF='\e[38;5;220m'      # yellow            → fire tip
GY='\e[38;5;240m'      # dark gray         → stone / dim
ST='\e[38;5;94m'       # warm brown        → ledge/ladder

# ── Cursor position: g <row> <col> ───────────────────────────
g() { tput cup "$1" "$2"; }

clear

# ─────────────────────────────────────────────────────────────
# LEFT PANEL: Gorilla scene (cols 0–29)
# RIGHT PANEL: Logo box + menu (cols 32–75)
# ─────────────────────────────────────────────────────────────

# ── Vines ────────────────────────────────────────────────────
g 0 0;  printf "${GN}  ╻╻ ▓▓▓  ╻       ╻  ▓▓▓ ╻╻${RS}"
g 1 0;  printf "${GN}  ┃┃▓████ ┃       ┃ ████▓┃┃${RS}"
g 2 0;  printf "${GN}  ┃┃▓████▓┃       ┃▓████▓┃┃${RS}"
g 3 0;  printf "${GN}  ┃┃      ┃       ┃      ┃┃${RS}"

# ── Gorilla head ─────────────────────────────────────────────
g 4 3;  printf "${BL}   ▄▄██████████▄▄   ${RS}"
g 5 2;  printf "${BL} ████▓▓▓▓▓▓▓▓▓▓████ ${RS}"
g 6 1;  printf "${BL}████${MB}░░${BL}████████████${MB}░░${BL}████${RS}"
g 7 1;  printf "${BL}███${MB}░${BL}██ ${LB}●${BL}██████${LB}● ${BL}██${MB}░${BL}███${RS}"
g 8 1;  printf "${BL}███${MB}░${BL}██  ▄${WH}████${BL}▄  ██${MB}░${BL}███${RS}"
g 9 1;  printf "${BL}███${MB}░${BL}██  ${WH}██████${BL}  ██${MB}░${BL}███${RS}"

# ── Gorilla body ─────────────────────────────────────────────
g 10 1; printf "${BL}████${MB}░░${BL}████████████${MB}░░${BL}████${RS}"
g 11 0; printf "${BL}███████${MB}░░░░░░░░░░░░${BL}███████${RS}"

# ── Arms on ledge ────────────────────────────────────────────
g 12 0; printf "${BL}██${MB}░${BL}███${MB}░░░░░░░░░░░░░░░${BL}███${MB}░${BL}██${RS}"

# ── Fire + stone ledge ───────────────────────────────────────
g 13 0; printf "${YF}  ▒▒${RD}██${GY}═══════════════════${RD}██${YF}▒▒  ${RS}"
g 14 0; printf "${RD}██████${GY}█████████████████████${RD}██████${RS}"
g 15 0; printf "${GY}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RS}"

# ── Ladder ───────────────────────────────────────────────────
g 16 11; printf "${ST}╔══════╗${RS}"
g 17 11; printf "${ST}║${GY}▓▓▓▓▓▓${ST}║${RS}"
g 18 11; printf "${ST}╚══════╝${RS}"

# ─────────────────────────────────────────────────────────────
# LOGO BOX (rows 0–9, col 36)
# Interior width: 40 chars
# ─────────────────────────────────────────────────────────────
g 0 36;  printf "${CY}╔══════════════════════════════════════════╗${RS}"
g 1 36;  printf "${CY}║${RS}                                          ${CY}║${RS}"
g 2 36;  printf "${CY}║${RS}                                          ${CY}║${RS}"
g 3 36;  printf "${CY}║${RS}    ${OR}I N N E R A N I M A L${RS}               ${CY}║${RS}"
g 4 36;  printf "${CY}║${RS}    ${OR}━━━━━━━━━━━━━━━━━━━━━━━${RS}              ${CY}║${RS}"
g 5 36;  printf "${CY}║${RS}           ${OR}M  E  D  I  A${RS}                 ${CY}║${RS}"
g 6 36;  printf "${CY}║${RS}                                          ${CY}║${RS}"
# Path line — truncate if too long
_dir="${PWD/#$HOME/\~}"
(( ${#_dir} > 36 )) && _dir="…${_dir: -35}"
g 7 36;  printf "${CY}║${RS}  ${GY}cd ${WH}${_dir}${RS}"
g 8 36;  printf "${CY}║${RS}                                          ${CY}║${RS}"
g 9 36;  printf "${CY}╚══════════════════════════════════════════╝${RS}"

# ─────────────────────────────────────────────────────────────
# MENU (rows 11–16, col 36)
# ─────────────────────────────────────────────────────────────
g 11 36; printf "${YL}  1.  ${WH}Start workspace${RS}"
g 12 36; printf "${YL}  2.  ${WH}Open agent${RS}"
g 13 36; printf "${YL}  3.  ${WH}Activate tools${RS}"
g 14 36; printf "${YL}  4.  ${WH}Switch theme${RS}"
g 15 36; printf "${YL}  5.  ${WH}Run diagnostics${RS}"

g 17 36; printf "${YL}Enter a number to get started...${RS}"

# ── Move cursor below scene, prompt ──────────────────────────
g 20 0; printf "${RS}"

read -rp "$(printf "  ${YL}→ ${RS}")" _ch
printf "\n"

# ─────────────────────────────────────────────────────────────
# MENU ACTIONS — wire these up to your real commands
# ─────────────────────────────────────────────────────────────
case "$_ch" in
  1)
    printf "${CY}  Starting workspace...${RS}\n\n"
    cd ~/Downloads/march1st-inneranimalmedia || true
    # Uncomment to auto-open Cursor:
    # cursor . &
    ;;
  2)
    printf "${CY}  Opening agent dashboard...${RS}\n\n"
    open "https://inneranimalmedia.com/dashboard/agent"
    ;;
  3)
    printf "${CY}  Activating tools...${RS}\n\n"
    # PTY health check / MCP activation:
    # curl -s http://127.0.0.1:3099/health && echo "PTY: online"
    printf "${GY}  → Add your tool activation commands here.${RS}\n\n"
    ;;
  4)
    printf "${CY}  Switching theme...${RS}\n\n"
    # Toggle macOS dark/light (requires System Events access):
    # osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode'
    printf "${GY}  → Add your theme toggle here.${RS}\n\n"
    ;;
  5)
    printf "${CY}  Running diagnostics...${RS}\n\n"
    printf "  node      → %s\n" "$(node --version 2>/dev/null || echo 'not found')"
    printf "  wrangler  → %s\n" "$(wrangler --version 2>/dev/null || echo 'not found')"
    printf "  npm       → %s\n" "$(npm --version 2>/dev/null || echo 'not found')"
    printf "\n${CY}  Systems checked.${RS}\n\n"
    ;;
  "" | q | Q)
    printf "${GY}  Skipping. Good luck today.${RS}\n\n"
    ;;
  *)
    printf "${GY}  Unknown option. Continuing...${RS}\n\n"
    ;;
esac

# ── Cleanup — don't pollute the shell env ────────────────────
unset RS CY YL OR WH GN BL MB LB RD YF GY ST _ch _dir
unset -f g
