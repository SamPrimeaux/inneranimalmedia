#!/usr/bin/env node
/** Cursor beforeShellExecution — exit 0 allow, 1 block; no stdout. */
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  let command = '';
  try {
    const raw = Buffer.concat(chunks).toString();
    const parsed = raw ? JSON.parse(raw) : {};
    command = String(parsed.command ?? parsed.cmd ?? '').trim();
  } catch {
    process.exit(1);
    return;
  }

  const safePrefixes = [
    'git status',
    'git log',
    'git diff',
    'npm run',
    'ls',
    'cat',
    'grep',
    'echo',
    'pwd',
    'node --check',
  ];
  if (safePrefixes.some((p) => command.startsWith(p))) {
    process.exit(0);
    return;
  }

  const blocked = ['rm -rf', 'drop table', 'delete from', 'wrangler secret'];
  if (blocked.some((p) => command.toLowerCase().includes(p))) {
    process.exit(1);
    return;
  }

  process.exit(0);
});
