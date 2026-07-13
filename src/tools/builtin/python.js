/**
 * Python execution tool — runs Python on the IAM PTY host via the same HTTP /exec
 * path as terminal_execute (see src/do/AgentChat.js executePtyCommand, src/core/terminal.js).
 */

import { runTerminalCommandViaHttpExec } from '../../core/terminal.js';

const PTY_EXEC_URL = 'http://localhost:3099/exec';

export const PYTHON_TOOLS = [
  {
    name: 'agentsam_code_interpreter',
    description: `Run short Python for math, stats, transforms, and plots on data ALREADY in this turn
(after agentsam_d1_query / fs_read_file / github read). Second step only — do not fetch data with this tool,
and do not use it for repo edits, deploys, or shell (use fs_*/agentsam_github_*/agentsam_terminal_sandbox).
Scratch Python environment; inline any D1/CSV payloads in the script. Returns stdout, stderr, exit_code.`,
    input_schema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description:
            'Python source. Prefer one structured script. Inline prior tool results as literals.',
        },
        pip_install: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional pip packages before running, e.g. ["pandas","numpy"].',
        },
        working_dir: {
          type: 'string',
          description: 'Optional working directory on the exec host.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Reserved for future timeout support; may be ignored by current exec backend.',
        },
      },
      required: ['script'],
    },
  },
];

/** Reduce shell injection risk for cwd paths. */
function sanitizeWorkingDir(dir) {
  const s = String(dir || '').trim();
  if (!s) return '';
  if (s.length > 512) return '';
  if (/[^\w\-\/\.]/.test(s)) return '';
  return s;
}

/**
 * Match AgentChat._ptyExecPayload / terminal VPC exec: POST http://localhost:3099/exec with JSON.
 * @param {any} env
 * @param {string} command
 * @param {string} [cwd]
 */
async function ptyExecHttp(env, command, cwd) {
  const payload = { command };
  const wd = sanitizeWorkingDir(cwd);
  if (wd) payload.cwd = wd;

  if (env?.PTY_SERVICE) {
    try {
      const res = await env.PTY_SERVICE.fetch(
        new Request(PTY_EXEC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      const data = await res.json().catch(() => ({}));
      const primary = {
        ok: res.ok,
        stdout: typeof data.stdout === 'string' ? data.stdout : '',
        stderr: typeof data.stderr === 'string' ? data.stderr : '',
        exit_code: Number.isFinite(Number(data.exit_code)) ? Number(data.exit_code) : res.ok ? 0 : 1,
        httpStatus: res.status,
        rawError: !res.ok ? String(data.error || '') : '',
      };
      if (primary.ok) return primary;
      const cmdForFallback = wd ? `cd ${JSON.stringify(wd)} && ${command}` : command;
      const fb = await runTerminalCommandViaHttpExec(env, cmdForFallback);
      if (fb.ok) {
        return {
          ok: true,
          stdout: fb.text || '',
          stderr: '',
          exit_code: fb.exitCode ?? 0,
          httpStatus: 200,
          rawError: '',
        };
      }
      return primary;
    } catch (e) {
      const cmdForFallback = wd ? `cd ${JSON.stringify(wd)} && ${command}` : command;
      const fb = await runTerminalCommandViaHttpExec(env, cmdForFallback);
      if (fb.ok) {
        return {
          ok: true,
          stdout: fb.text || '',
          stderr: '',
          exit_code: fb.exitCode ?? 0,
          httpStatus: 200,
          rawError: '',
        };
      }
      return {
        ok: false,
        stdout: '',
        stderr: String(e?.message || e),
        exit_code: 1,
        httpStatus: 0,
        rawError: String(e?.message || e),
      };
    }
  }

  const cmdForFallback = wd ? `cd ${JSON.stringify(wd)} && ${command}` : command;
  const r = await runTerminalCommandViaHttpExec(env, cmdForFallback);
  if (r.ok) {
    return {
      ok: true,
      stdout: r.text || '',
      stderr: '',
      exit_code: r.exitCode ?? 0,
      httpStatus: 200,
      rawError: '',
    };
  }
  return {
    ok: false,
    stdout: '',
    stderr: r.text || 'PTY exec unavailable',
    exit_code: 1,
    httpStatus: 0,
    rawError: 'HTTP exec fallback failed',
  };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 */
export async function python_execute(params, env) {
  const script = params.script;
  if (typeof script !== 'string' || !String(script).trim()) {
    return JSON.stringify({ error: 'script is required', stdout: '', stderr: '', exit_code: 1 });
  }

  const pipRaw = Array.isArray(params.pip_install) ? params.pip_install : [];
  const pip = pipRaw.map((p) => String(p || '').trim()).filter(Boolean);
  const workingDir = params.working_dir != null ? String(params.working_dir) : '';

  const pipPart =
    pip.length > 0
      ? `pip install --quiet ${pip.map((p) => JSON.stringify(p)).join(' ')}`
      : '';
  const pyPart = `python3 -c ${JSON.stringify(script)}`;
  const fullCommand = [pipPart, pyPart].filter(Boolean).join(' && ');

  const out = await ptyExecHttp(env, fullCommand, workingDir);

  return JSON.stringify({
    stdout: out.stdout,
    stderr: out.stderr + (out.rawError ? (out.stderr ? '\n' : '') + out.rawError : ''),
    exit_code: out.exit_code,
    ok: out.ok,
    ...(out.ok ? {} : { error: out.rawError || `exec failed (HTTP ${out.httpStatus || 'n/a'})` }),
  });
}
