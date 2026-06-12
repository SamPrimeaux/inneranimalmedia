/** PTY bridge stubs — full impl lives on inneranimalmedia main worker. */
export async function resolveMoviemodeRepoRootForSession() {
  return { ok: false, error: 'PTY render lane not configured on moviemode-service' };
}

export async function validateMoviemodeRepoOnPty() {
  return { ok: false, error: 'PTY not configured' };
}

export async function execOnPtyHost() {
  return new Response(JSON.stringify({ error: 'PTY not configured on moviemode-service' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
