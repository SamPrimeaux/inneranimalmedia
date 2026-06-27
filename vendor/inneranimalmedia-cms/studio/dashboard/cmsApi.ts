export type CmsApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function cmsApi<T = unknown>(path: string, opts: CmsApiOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    credentials: 'include',
    headers: isForm
      ? (opts.headers as HeadersInit) || {}
      : { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string>) },
    ...opts,
    body: isForm
      ? (opts.body as FormData)
      : opts.body != null
        ? JSON.stringify(opts.body)
        : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
      message?: string;
    };
    throw new Error(err.error || err.message || res.statusText);
  }
  return res.json() as Promise<T>;
}
