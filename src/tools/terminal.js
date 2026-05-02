/**
 * Tool: Terminal (term)
 * Allows the agent to run shell commands in the workspace PTY.
 */

export const handlers = {
  /**
   * run_command: Execute a single shell command and return the output.
   */
  async run_command({ command }, env) {
    try {
      const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
      // In CF Workers context, we connect to the PTY bridge via the /api/terminal/run endpoint
      const res = await fetch(`${origin}/api/agent/terminal/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command,
          session_id: env.PTY_SESSION_ID || 'default' 
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PTY Error');
      
      return {
        output: data.output || '(no output)',
        status: 'success'
      };
    } catch (e) {
      return { error: `Terminal Error: ${e.message}` };
    }
  },
};

export const definitions = [
  {
    name: 'run_command',
    description: 'Run a shell command in the terminal and see the results (stdout/stderr)',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute (e.g., ls -la, git status)' },
      },
      required: ['command'],
    },
  },
];
