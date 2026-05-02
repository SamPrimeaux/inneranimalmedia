/**
 * One-off: patch cms_themes.config.terminal for solarized-dark (login_scene + ansi + quick_actions).
 * Run: node scripts/push-solarized-terminal-scene.mjs
 * Requires: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute ... --file
 */
import { writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const SCENE = [
  "",
  "",
  "%%MUTED%%  ░░░░░░░░░░░░░░░░  %%CYAN%%╔══════════════════════════════════════╗%%RESET%%",
  "%%MUTED%%  ░%%SURFACE%%▄▄███████▄▄%%MUTED%%░░░  %%CYAN%%║%%RESET%%  %%BOLD%%%%YELLOW%%I N N E R A N I M A L  M E D I A%%RESET%%  %%CYAN%%║%%RESET%%",
  "%%MUTED%%  ░%%SURFACE%%██%%ORANGE%%◉%%SURFACE%%███%%ORANGE%%◉%%SURFACE%%██%%MUTED%%░░░  %%CYAN%%╠══════════════════════════════════════╣%%RESET%%",
  "%%MUTED%%  ░%%SURFACE%%███████████%%MUTED%%░░░  %%CYAN%%║%%RESET%%  %%DIM%%%%TEXT%%~/Downloads/march1st-inneranimalmedia%%RESET%%  %%CYAN%%║%%RESET%%",
  "%%MUTED%%  ░%%SURFACE%%▀███████▀%%MUTED%%░░░░  %%CYAN%%╚══════════════════════════════════════╝%%RESET%%",
  "%%MUTED%%  ░░%%SURFACE%%▄█████████▄%%MUTED%%░░  %%RESET%%",
  "%%MUTED%%  ░%%SURFACE%%█████████████%%MUTED%%░  %%RESET%%",
  "%%MUTED%%  ░░░░░░░░░░░░░░░░  %%RESET%%",
  "",
  "%%MUTED%%  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄%%RESET%%",
  "",
  "    %%YELLOW%%1.%%RESET%%  Start workspace        %%YELLOW%%4.%%RESET%%  Switch theme",
  "    %%YELLOW%%2.%%RESET%%  Open agent             %%YELLOW%%5.%%RESET%%  Run diagnostics",
  "    %%YELLOW%%3.%%RESET%%  Activate tools",
  "",
  "    %%ORANGE%%Enter a number to get started...%%RESET%%",
  "",
].join("\r\n");

const terminal = {
  font_size: 13,
  font_family: "monospace",
  cursor_style: "block",
  cursor_blink: 1,
  padding: 8,
  ansi: {
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  login_scene: SCENE,
  personality: {
    prompt_label: "sam@iam",
    prompt_style: "bracket",
    motd: null,
    project_name: "inneranimalmedia",
    show_branch: 1,
    show_timing: 0,
  },
  quick_actions: [
    { label: "cd build", cmd: "cd ~/Downloads/march1st-inneranimalmedia", action_type: null },
    { label: "git status", cmd: "git status", action_type: null },
    { label: "git log", cmd: "git log --oneline -6", action_type: null },
    {
      label: "build",
      cmd: "cd ~/Downloads/march1st-inneranimalmedia && npm run build:vite-only",
      action_type: null,
    },
    { label: "deploy", cmd: "cd ~/Downloads/march1st-inneranimalmedia && ./scripts/deploy-sandbox.sh", action_type: null },
    { label: "iam-pty health", cmd: "curl -s http://127.0.0.1:3099/health", action_type: null },
    { label: "pwd", cmd: "pwd", action_type: null },
    { label: "ls", cmd: "ls -la", action_type: null },
  ],
};

const termJson = JSON.stringify(terminal);
const escaped = termJson.replace(/'/g, "''");
const sql = `UPDATE cms_themes SET config = json_patch(config, json_object('is_dark', 1, 'monaco_theme', 'vs-dark', 'terminal', json('${escaped}'))) WHERE slug = 'solarized-dark';`;

const sqlPath = join(repoRoot, ".tmp-solarized-terminal.sql");
writeFileSync(sqlPath, sql, "utf8");
try {
  execSync(
    `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --file=${sqlPath} -c wrangler.production.toml`,
    { cwd: repoRoot, stdio: "inherit", shell: "/bin/bash" }
  );
} finally {
  try {
    unlinkSync(sqlPath);
  } catch (_) {}
}
