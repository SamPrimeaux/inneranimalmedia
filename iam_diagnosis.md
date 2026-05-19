# IAM Agent Dashboard — Targeted Bug Diagnosis
Generated: 2026-05-16 10:04

> This report reads the **exact architectural files** and surfaces the
> specific lines responsible for each known bug.
> Copy a section into Cursor/Claude with the file open to fix in-place.

---

## [HARDCODED_R2]  R2 Hardcoded Buckets / 'BOUND' label inaccuracy

### `dashboard/src/lib/r2Buckets.ts`

**🔍 'BOUND' badge logic**
Line 8: `bound?: string[];`
```
     5 │ 
     6 │ export type R2BucketsApiResponse = {
     7 │   buckets?: string[];
     8 │   bound?: string[];
     9 │   resolve?: Record<string, string>;
    10 │ };
    11 │ 
```
Line 16: `/** Prefer server `buckets` (deduped); fall back to bound list. */`
```
    13 │   return data.resolve && typeof data.resolve === 'object' ? data.resolve : {};
    14 │ }
    15 │ 
    16 │ /** Prefer server `buckets` (deduped); fall back to bound list. */
    17 │ export function pickR2DisplayBuckets(data: R2BucketsApiResponse): string[] {
    18 │   if (Array.isArray(data.buckets) && data.buckets.length) return data.buckets;
    19 │   if (Array.isArray(data.bound) && data.bound.length) return data.bound;
```
Line 19: `if (Array.isArray(data.bound) && data.bound.length) return data.bound;`
```
    16 │ /** Prefer server `buckets` (deduped); fall back to bound list. */
    17 │ export function pickR2DisplayBuckets(data: R2BucketsApiResponse): string[] {
    18 │   if (Array.isArray(data.buckets) && data.buckets.length) return data.buckets;
    19 │   if (Array.isArray(data.bound) && data.bound.length) return data.bound;
    20 │   return [];
    21 │ }
    22 │ 
```

### `dashboard/components/R2Explorer.tsx`

_No matching signals in this file._

### `src/api/r2-api.js`

**🔍 Hardcoded bucket name literal**
Line 35: `return name === 'inneranimalmedia' || name === 'inneranimalmedia-assets';`
```
    32 │ 
    33 │ /** Primary dashboard asset bucket (logical name); bindings may alias legacy names to the same bucket. */
    34 │ function isDashboardMediaBucket(name) {
    35 │   return name === 'inneranimalmedia' || name === 'inneranimalmedia-assets';
    36 │ }
    37 │ 
    38 │ const DASHBOARD_MEDIA_KEY_PREFIXES = [
```
Line 67: `ASSETS: 'inneranimalmedia-assets',`
```
    64 │ /** Dashboard /api/r2/file sends binding labels; map to canonical R2 bucket names. */
    65 │ const BINDING_LABEL_TO_BUCKET = {
    66 │   DASHBOARD: 'inneranimalmedia',
    67 │   ASSETS: 'inneranimalmedia-assets',
    68 │   R2: 'iam-platform',
    69 │   DOCS_BUCKET: 'iam-docs',
    70 │   AUTORAG_BUCKET: 'autorag',
```
Line 68: `R2: 'iam-platform',`
```
    65 │ const BINDING_LABEL_TO_BUCKET = {
    66 │   DASHBOARD: 'inneranimalmedia',
    67 │   ASSETS: 'inneranimalmedia-assets',
    68 │   R2: 'iam-platform',
    69 │   DOCS_BUCKET: 'iam-docs',
    70 │   AUTORAG_BUCKET: 'autorag',
    71 │ };
```
Line 69: `DOCS_BUCKET: 'iam-docs',`
```
    66 │   DASHBOARD: 'inneranimalmedia',
    67 │   ASSETS: 'inneranimalmedia-assets',
    68 │   R2: 'iam-platform',
    69 │   DOCS_BUCKET: 'iam-docs',
    70 │   AUTORAG_BUCKET: 'autorag',
    71 │ };
    72 │ 
```
Line 70: `AUTORAG_BUCKET: 'autorag',`
```
    67 │   ASSETS: 'inneranimalmedia-assets',
    68 │   R2: 'iam-platform',
    69 │   DOCS_BUCKET: 'iam-docs',
    70 │   AUTORAG_BUCKET: 'autorag',
    71 │ };
    72 │ 
    73 │ export function resolveR2BucketName(env, bucketOrBinding) {
```

**🔍 'BOUND' badge logic**
Line 92: `async function assertR2UnboundS3Auth(request, env, binding) {`
```
    89 │ }
    90 │ 
    91 │ /** Account-wide S3 API requires an authenticated dashboard user when no Worker binding exists. */
    92 │ async function assertR2UnboundS3Auth(request, env, binding) {
    93 │   if (binding) return null;
    94 │   if (!hasR2S3Credentials(env)) {
    95 │     return jsonResponse({ error: 'Bucket not bound and R2 S3 credentials missing' }, 400);
```
Line 95: `return jsonResponse({ error: 'Bucket not bound and R2 S3 credentials missing' }, 400);`
```
    92 │ async function assertR2UnboundS3Auth(request, env, binding) {
    93 │   if (binding) return null;
    94 │   if (!hasR2S3Credentials(env)) {
    95 │     return jsonResponse({ error: 'Bucket not bound and R2 S3 credentials missing' }, 400);
    96 │   }
    97 │   const authUser = await getAuthUser(request, env);
    98 │   if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
```
Line 273: `const s3Denied = await assertR2UnboundS3Auth(request, env, binding);`
```
   270 │   if (!bucketParam || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
   271 │ 
   272 │   const { bucketName, binding } = resolveR2Access(env, bucketParam);
   273 │   const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
   274 │   if (s3Denied) return s3Denied;
   275 │ 
   276 │   if (method === 'DELETE') {
```
Line 362: `const bound = listBoundR2BucketNames(env);`
```
   359 │ 
   360 │   // 1. Buckets & Inventory
   361 │   if (pathLower === '/api/r2/buckets' && method === 'GET') {
   362 │     const bound = listBoundR2BucketNames(env);
   363 │     const display = dedupeBoundR2BucketNames(env);
   364 │     const resolve = buildR2BucketResolveMap(env);
   365 │     if (url.searchParams.get('all') !== 'true') {
```
Line 363: `const display = dedupeBoundR2BucketNames(env);`
```
   360 │   // 1. Buckets & Inventory
   361 │   if (pathLower === '/api/r2/buckets' && method === 'GET') {
   362 │     const bound = listBoundR2BucketNames(env);
   363 │     const display = dedupeBoundR2BucketNames(env);
   364 │     const resolve = buildR2BucketResolveMap(env);
   365 │     if (url.searchParams.get('all') !== 'true') {
   366 │       return jsonResponse({ buckets: display, bound, resolve, source: 'bindings' });
```

### `dashboard/App.tsx`

**🔍 'BOUND' badge logic**
Line 185: `/** Agent Sam chat column width bounds (px). */`
```
   182 │   integrations: 'Integrations',
   183 │ };
   184 │ 
   185 │ /** Agent Sam chat column width bounds (px). */
   186 │ const AGENT_PANEL_MIN_W = 320;
   187 │ const AGENT_PANEL_MAX_W = 640;
   188 │ /** Minimum width kept for the main editor/workspace while dragging the agent column. */
```

### `dashboard/components/UnifiedSearchBar.tsx`

**🔍 Hardcoded bucket name literal**
Line 253: `id: 'db-autorag',`
```
   250 │       subtitle: 'Embeddings index · tenant registry',
   251 │     },
   252 │     {
   253 │       id: 'db-autorag',
   254 │       category: 'd1',
   255 │       title: 'AutoRAG',
   256 │       subtitle: 'RAG pipeline · autorag bucket',
```
Line 255: `title: 'AutoRAG',`
```
   252 │     {
   253 │       id: 'db-autorag',
   254 │       category: 'd1',
   255 │       title: 'AutoRAG',
   256 │       subtitle: 'RAG pipeline · autorag bucket',
   257 │     },
   258 │   ];
```
Line 256: `subtitle: 'RAG pipeline · autorag bucket',`
```
   253 │       id: 'db-autorag',
   254 │       category: 'd1',
   255 │       title: 'AutoRAG',
   256 │       subtitle: 'RAG pipeline · autorag bucket',
   257 │     },
   258 │   ];
   259 │ }
```

**🔍 'BOUND' badge logic**
Line 55: `bound?: boolean;`
```
    52 │   category: PaletteCategory;
    53 │   title: string;
    54 │   subtitle?: string;
    55 │   bound?: boolean;
    56 │   objectCount?: number | null;
    57 │   commandText?: string;
    58 │   conversationId?: string;
```
Line 169: `async function fetchBoundR2Buckets(): Promise<string[]> {`
```
   166 │   }
   167 │ }
   168 │ 
   169 │ async function fetchBoundR2Buckets(): Promise<string[]> {
   170 │   const fromBuckets = await fetchJson<{ buckets?: string[] }>('/api/r2/buckets');
   171 │   if (fromBuckets?.buckets?.length) return fromBuckets.buckets.map(String);
   172 │   const fromList = await fetchJson<{ buckets?: string[] }>('/api/r2/list?buckets=true');
```
Line 177: `async function fetchAllR2BucketNames(): Promise<{ name: string; bound: boolean; object_count?: number }[]> {`
```
   174 │   return [];
   175 │ }
   176 │ 
   177 │ async function fetchAllR2BucketNames(): Promise<{ name: string; bound: boolean; object_count?: number }[]> {
   178 │   const bound = await fetchBoundR2Buckets();
   179 │   const boundSet = new Set(bound);
   180 │   let account: string[] = [];
```
Line 178: `const bound = await fetchBoundR2Buckets();`
```
   175 │ }
   176 │ 
   177 │ async function fetchAllR2BucketNames(): Promise<{ name: string; bound: boolean; object_count?: number }[]> {
   178 │   const bound = await fetchBoundR2Buckets();
   179 │   const boundSet = new Set(bound);
   180 │   let account: string[] = [];
   181 │ 
```
Line 179: `const boundSet = new Set(bound);`
```
   176 │ 
   177 │ async function fetchAllR2BucketNames(): Promise<{ name: string; bound: boolean; object_count?: number }[]> {
   178 │   const bound = await fetchBoundR2Buckets();
   179 │   const boundSet = new Set(bound);
   180 │   let account: string[] = [];
   181 │ 
   182 │   const fromAll = await fetchJson<{ buckets?: string[]; bucket_names?: string[] }>(
```

---

## [GITHUB_REAUTH_LOOP]  GitHub repo-click re-auth cycle

### `dashboard/components/GitHubExplorer.tsx`

**🔍 repos array being cleared — triggers reconnect prompt**
Line 77: `setRepos([]);`
```
    74 │     if (Date.now() < rlUntil) {
    75 │       rateLimitedUntil.current = rlUntil;
    76 │       setLoadError('Rate limited — try again shortly');
    77 │       setRepos([]);
    78 │       setIsAuthenticated(true);
    79 │       setReconnectAfterReposFailure(false);
    80 │       setIsLoading(false);
```
Line 104: `setRepos([]);`
```
   101 │         if (kind === 'reconnect') {
   102 │           setIsAuthenticated(false);
   103 │           setReconnectAfterReposFailure(true);
   104 │           setRepos([]);
   105 │           return;
   106 │         }
   107 │         if (kind === 'rate_limit') {
```
Line 117: `setRepos([]);`
```
   114 │           }
   115 │           setIsAuthenticated(true);
   116 │           setReconnectAfterReposFailure(false);
   117 │           setRepos([]);
   118 │           setLoadError('Rate limited — try again shortly');
   119 │           return;
   120 │         }
```
Line 124: `setRepos([]);`
```
   121 │         if (kind === 'unavailable') {
   122 │           setIsAuthenticated(true);
   123 │           setReconnectAfterReposFailure(false);
   124 │           setRepos([]);
   125 │           setLoadError('GitHub sync unavailable');
   126 │           return;
   127 │         }
```
Line 140: `setRepos([]);`
```
   137 │           if (errStr === 'not_connected' || msgStr.includes('not_connected')) {
   138 │             setIsAuthenticated(false);
   139 │             setReconnectAfterReposFailure(true);
   140 │             setRepos([]);
   141 │             return;
   142 │           }
   143 │           setIsAuthenticated(true);
```

**🔍 Error handling that may wipe repo list**
Line 125: `setLoadError('GitHub sync unavailable');`
```
   122 │           setIsAuthenticated(true);
   123 │           setReconnectAfterReposFailure(false);
   124 │           setRepos([]);
   125 │           setLoadError('GitHub sync unavailable');
   126 │           return;
   127 │         }
   128 │         if (res.status === 400) {
```
Line 174: `console.warn('[GitHubExplorer] GET /api/integrations/github/repos exception', err);`
```
   171 │       setRepos(list);
   172 │       setIsAuthenticated(true);
   173 │     } catch (err) {
   174 │       console.warn('[GitHubExplorer] GET /api/integrations/github/repos exception', err);
   175 │       setIsAuthenticated(false);
   176 │       setReconnectAfterReposFailure(false);
   177 │       setLoadError(err instanceof Error ? err.message : 'Failed to load repos');
```
Line 250: `setLoadError('GitHub sync unavailable');`
```
   247 │           return;
   248 │         }
   249 │         if (ckKind === 'unavailable') {
   250 │           setLoadError('GitHub sync unavailable');
   251 │           return;
   252 │         }
   253 │         const msg =
```
Line 445: `{reconnectAfterReposFailure ? 'Reconnect GitHub' : 'GitHub'}`
```
   442 │           </div>
   443 │         </div>
   444 │         <h3 className="text-[14px] font-bold mb-2 uppercase tracking-widest text-[var(--text-heading)]">
   445 │           {reconnectAfterReposFailure ? 'Reconnect GitHub' : 'GitHub'}
   446 │         </h3>
   447 │         <p className="text-[11px] font-mono text-[var(--text-muted)] mb-8 max-w-[220px]">
   448 │           {reconnectAfterReposFailure
```
Line 449: `? 'GitHub returned an authorization or endpoint error (expired token, revoked access, or missing route). Use Reconnect t`
```
   446 │         </h3>
   447 │         <p className="text-[11px] font-mono text-[var(--text-muted)] mb-8 max-w-[220px]">
   448 │           {reconnectAfterReposFailure
   449 │             ? 'GitHub returned an authorization or endpoint error (expired token, revoked access, or missing route). Use Reconnect to run the same OAuth flow as Connect.'
   450 │             : 'Connect GitHub OAuth to list repos, browse, open, create, save, and delete files (per repo permissions).'}
   451 │         </p>
   452 │         <button
```

**🔍 Reconnect/re-auth trigger logic**
Line 35: `type RepoListErrorKind = 'reconnect' | 'rate_limit' | 'unavailable' | 'other';`
```
    32 │ 
    33 │ const GITHUB_REPOS_RL_UNTIL_KEY = 'iam_github_repos_rl_until';
    34 │ 
    35 │ type RepoListErrorKind = 'reconnect' | 'rate_limit' | 'unavailable' | 'other';
    36 │ 
    37 │ function repoListErrorKind(status: number): RepoListErrorKind {
    38 │   if (status === 401 || status === 403 || status === 404) return 'reconnect';
```
Line 38: `if (status === 401 || status === 403 || status === 404) return 'reconnect';`
```
    35 │ type RepoListErrorKind = 'reconnect' | 'rate_limit' | 'unavailable' | 'other';
    36 │ 
    37 │ function repoListErrorKind(status: number): RepoListErrorKind {
    38 │   if (status === 401 || status === 403 || status === 404) return 'reconnect';
    39 │   if (status === 429) return 'rate_limit';
    40 │   if (status >= 500) return 'unavailable';
    41 │   return 'other';
```
Line 51: `/** True when repo list returned 404 — show “Reconnect” copy vs first-time connect. */`
```
    48 │   onExpandRepoConsumed?: () => void;
    49 │ }> = ({ onOpenInEditor, expandRepoFullName, onExpandRepoConsumed }) => {
    50 │   const [isAuthenticated, setIsAuthenticated] = useState(true);
    51 │   /** True when repo list returned 404 — show “Reconnect” copy vs first-time connect. */
    52 │   const [reconnectAfterReposFailure, setReconnectAfterReposFailure] = useState(false);
    53 │   const [repos, setRepos] = useState<any[]>([]);
    54 │   const [isLoading, setIsLoading] = useState(true);
```
Line 52: `const [reconnectAfterReposFailure, setReconnectAfterReposFailure] = useState(false);`
```
    49 │ }> = ({ onOpenInEditor, expandRepoFullName, onExpandRepoConsumed }) => {
    50 │   const [isAuthenticated, setIsAuthenticated] = useState(true);
    51 │   /** True when repo list returned 404 — show “Reconnect” copy vs first-time connect. */
    52 │   const [reconnectAfterReposFailure, setReconnectAfterReposFailure] = useState(false);
    53 │   const [repos, setRepos] = useState<any[]>([]);
    54 │   const [isLoading, setIsLoading] = useState(true);
    55 │   const [loadError, setLoadError] = useState<string | null>(null);
```
Line 79: `setReconnectAfterReposFailure(false);`
```
    76 │       setLoadError('Rate limited — try again shortly');
    77 │       setRepos([]);
    78 │       setIsAuthenticated(true);
    79 │       setReconnectAfterReposFailure(false);
    80 │       setIsLoading(false);
    81 │       return;
    82 │     }
```

**🔍 Token stored in localStorage/sessionStorage (cleared on error?)**
Line 65: `const n = Number(sessionStorage.getItem(GITHUB_REPOS_RL_UNTIL_KEY) || 0);`
```
    62 │ 
    63 │   const readReposRateLimitUntil = (): number => {
    64 │     try {
    65 │       const n = Number(sessionStorage.getItem(GITHUB_REPOS_RL_UNTIL_KEY) || 0);
    66 │       return Number.isFinite(n) ? n : 0;
    67 │     } catch {
    68 │       return 0;
```
Line 111: `sessionStorage.setItem(GITHUB_REPOS_RL_UNTIL_KEY, String(until));`
```
   108 │           const until = Date.now() + 60_000;
   109 │           rateLimitedUntil.current = until;
   110 │           try {
   111 │             sessionStorage.setItem(GITHUB_REPOS_RL_UNTIL_KEY, String(until));
   112 │           } catch {
   113 │             /* private mode */
   114 │           }
```
Line 186: `const raw = sessionStorage.getItem(GITHUB_REPOS_RL_UNTIL_KEY);`
```
   183 │ 
   184 │   useEffect(() => {
   185 │     try {
   186 │       const raw = sessionStorage.getItem(GITHUB_REPOS_RL_UNTIL_KEY);
   187 │       const n = raw ? Number(raw) : 0;
   188 │       if (Number.isFinite(n) && n > Date.now()) rateLimitedUntil.current = n;
   189 │     } catch {
```

### `dashboard/App.tsx`

**🔍 Error handling that may wipe repo list**
Line 1410: `if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') throw new Error('github');`
```
  1407 │             { credentials: 'same-origin' },
  1408 │           );
  1409 │           const data = await res.json();
  1410 │           if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') throw new Error('github');
  1411 │           const raw = String(data.content).replace(/\n/g, '');
  1412 │           const binary = atob(raw);
  1413 │           const bytes = new Uint8Array(binary.length);
```

### `src/api/agent.js`

**🔍 Error handling that may wipe repo list**
Line 7839: `const { token, error, status } = await resolveGitHubToken(authUser, env);`
```
  7836 │     if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  7837 │     if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  7838 │ 
  7839 │     const { token, error, status } = await resolveGitHubToken(authUser, env);
  7840 │     if (error) return jsonResponse({ error }, status);
  7841 │ 
  7842 │     const workerName = projectIdFromEnv(env);
```
Line 7869: `return jsonResponse({ error: 'GitHub API error', status: ghRes.status, detail: await ghRes.text() }, 502);`
```
  7866 │     );
  7867 │ 
  7868 │     if (!ghRes.ok) {
  7869 │       return jsonResponse({ error: 'GitHub API error', status: ghRes.status, detail: await ghRes.text() }, 502);
  7870 │     }
  7871 │ 
  7872 │     const ghBranches = await ghRes.json();
```
Line 7893: `const { token, error, status } = await resolveGitHubToken(authUser, env);`
```
  7890 │     if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  7891 │     if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  7892 │ 
  7893 │     const { token, error, status } = await resolveGitHubToken(authUser, env);
  7894 │     if (error) return jsonResponse({ error }, status);
  7895 │ 
  7896 │     const ghRes = await fetch(
```
Line 7909: `return jsonResponse({ error: 'GitHub API error', status: ghRes.status }, 502);`
```
  7906 │     );
  7907 │ 
  7908 │     if (!ghRes.ok) {
  7909 │       return jsonResponse({ error: 'GitHub API error', status: ghRes.status }, 502);
  7910 │     }
  7911 │ 
  7912 │     const ghRepos = await ghRes.json();
```

---

## [GOOGLE_DRIVE_OAUTH_LOOP]  Google Drive OAuth connect loop

### `dashboard/components/GoogleDriveExplorer.tsx`

**🔍 Connect button / trigger**
Line 134: `window.location.href = '/api/oauth/google/start?return_to=/dashboard/agent&connect=drive';`
```
   131 │   }, []);
   132 │ 
   133 │   const handleConnect = () => {
   134 │     window.location.href = '/api/oauth/google/start?return_to=/dashboard/agent&connect=drive';
   135 │   };
   136 │ 
   137 │   const isFolder = (mime: string | undefined) => mime === 'application/vnd.google-apps.folder';
```
Line 300: `<ExternalLink size={14} /> Connect Google Drive`
```
   297 │           onClick={handleConnect}
   298 │           className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--solar-blue)] border border-[var(--solar-blue)] hover:brightness-110 rounded text-[11px] font-bold text-[var(--solar-base03)] transition-all"
   299 │         >
   300 │           <ExternalLink size={14} /> Connect Google Drive
   301 │         </button>
   302 │         <div className="mt-8 p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-left w-full max-w-[280px]">
   303 │           <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--solar-yellow)] mb-1">
```

**🔍 OAuth redirect handling**
Line 106: `/** OAuth return: worker redirects with ?connected=google&success=true (see oauth callback). */`
```
   103 │     void fetchFiles();
   104 │   }, [fetchFiles]);
   105 │ 
   106 │   /** OAuth return: worker redirects with ?connected=google&success=true (see oauth callback). */
   107 │   useEffect(() => {
   108 │     try {
   109 │       const params = new URLSearchParams(window.location.search);
```
Line 109: `const params = new URLSearchParams(window.location.search);`
```
   106 │   /** OAuth return: worker redirects with ?connected=google&success=true (see oauth callback). */
   107 │   useEffect(() => {
   108 │     try {
   109 │       const params = new URLSearchParams(window.location.search);
   110 │       if (params.get('connected') !== 'google' || params.get('success') !== 'true') return;
   111 │ 
   112 │       const url = new URL(window.location.href);
```
Line 112: `const url = new URL(window.location.href);`
```
   109 │       const params = new URLSearchParams(window.location.search);
   110 │       if (params.get('connected') !== 'google' || params.get('success') !== 'true') return;
   111 │ 
   112 │       const url = new URL(window.location.href);
   113 │       url.searchParams.delete('connected');
   114 │       url.searchParams.delete('success');
   115 │       const qs = url.searchParams.toString();
```
Line 134: `window.location.href = '/api/oauth/google/start?return_to=/dashboard/agent&connect=drive';`
```
   131 │   }, []);
   132 │ 
   133 │   const handleConnect = () => {
   134 │     window.location.href = '/api/oauth/google/start?return_to=/dashboard/agent&connect=drive';
   135 │   };
   136 │ 
   137 │   const isFolder = (mime: string | undefined) => mime === 'application/vnd.google-apps.folder';
```

### `dashboard/App.tsx`

**🔍 OAuth redirect handling**
Line 469: `const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';`
```
   466 │   useEffect(() => {
   467 │     const wsId = authWorkspaceId?.trim();
   468 │     if (!wsId) return;
   469 │     const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   470 │     const room = encodeURIComponent(`canvas:${wsId}`);
   471 │     const wsUrl = `${proto}//${window.location.host}/api/collab/room/${room}`;
   472 │     const ws = new WebSocket(wsUrl);
```
Line 471: `const wsUrl = `${proto}//${window.location.host}/api/collab/room/${room}`;`
```
   468 │     if (!wsId) return;
   469 │     const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   470 │     const room = encodeURIComponent(`canvas:${wsId}`);
   471 │     const wsUrl = `${proto}//${window.location.host}/api/collab/room/${room}`;
   472 │     const ws = new WebSocket(wsUrl);
   473 │     collabWsRef.current = ws;
   474 │     ws.onmessage = (e) => {
```
Line 1510: `const p = window.location.pathname;`
```
  1507 │     activity: 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'drive' | 'database',
  1508 │   ) => {
  1509 │     if (activity === 'files' && typeof window !== 'undefined') {
  1510 │       const p = window.location.pathname;
  1511 │       if (p !== '/dashboard/agent' && p !== '/dashboard/meet') {
  1512 │         navigate('/dashboard/agent');
  1513 │       }
```
Line 2901: `iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}`
```
  2898 │                           ref={terminalRef}
  2899 │                           onClose={() => setIsTerminalOpen(false)}
  2900 │                           problems={systemProblems ?? []}
  2901 │                           iamOrigin={typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'}
  2902 │                           workspaceLabel={workspaceDisplayLine}
  2903 │                           workspaceId={authWorkspaceId || undefined}
  2904 │                           productLabel={PRODUCT_NAME}
```
Line 2952: `iamOrigin={window.location.origin}`
```
  2949 │                 <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
  2950 │                   <XTermShell
  2951 │                     ref={terminalRef}
  2952 │                     iamOrigin={window.location.origin}
  2953 │                     workspaceLabel={workspaceDisplayName || ''}
  2954 │                     workspaceId={authWorkspaceId || ''}
  2955 │                     productLabel="IAM"
```

### `src/api/agent.js`

_No matching signals in this file._

---

## [MOVIEMODE_BROKEN]  MovieMode MediaLibrary scan loop + glitchy viewer

### `dashboard/features/moviemode/MediaLibrary.tsx`

**🔍 rootHandle / workspace root callback stability**
Line 55: `rootHandle: FileSystemDirectoryHandle | null;`
```
    52 │ }
    53 │ 
    54 │ export const MediaLibrary: React.FC<{
    55 │   rootHandle: FileSystemDirectoryHandle | null;
    56 │   onOpenInMovieMode: (item: MediaLibraryItem) => void;
    57 │   onOpenPreview?: (item: MediaLibraryItem) => void;
    58 │ }> = ({ rootHandle, onOpenInMovieMode, onOpenPreview }) => {
```
Line 58: `}> = ({ rootHandle, onOpenInMovieMode, onOpenPreview }) => {`
```
    55 │   rootHandle: FileSystemDirectoryHandle | null;
    56 │   onOpenInMovieMode: (item: MediaLibraryItem) => void;
    57 │   onOpenPreview?: (item: MediaLibraryItem) => void;
    58 │ }> = ({ rootHandle, onOpenInMovieMode, onOpenPreview }) => {
    59 │   const [items, setItems] = useState<MediaLibraryItem[]>([]);
    60 │   const [apiItems, setApiItems] = useState<MediaLibraryItem[]>([]);
    61 │   const [loading, setLoading] = useState(false);
```
Line 64: `const rootHandleRef = useRef(rootHandle);`
```
    61 │   const [loading, setLoading] = useState(false);
    62 │   const [err, setErr] = useState<string | null>(null);
    63 │ 
    64 │   const rootHandleRef = useRef(rootHandle);
    65 │   rootHandleRef.current = rootHandle;
    66 │   const localBlobItemsRef = useRef<MediaLibraryItem[]>([]);
    67 │   const apiFetchStartedRef = useRef(false);
```
Line 65: `rootHandleRef.current = rootHandle;`
```
    62 │   const [err, setErr] = useState<string | null>(null);
    63 │ 
    64 │   const rootHandleRef = useRef(rootHandle);
    65 │   rootHandleRef.current = rootHandle;
    66 │   const localBlobItemsRef = useRef<MediaLibraryItem[]>([]);
    67 │   const apiFetchStartedRef = useRef(false);
    68 │   const scanGenRef = useRef(0);
```
Line 70: `const rootFolderKey = rootHandle?.name ?? '';`
```
    67 │   const apiFetchStartedRef = useRef(false);
    68 │   const scanGenRef = useRef(0);
    69 │ 
    70 │   const rootFolderKey = rootHandle?.name ?? '';
    71 │ 
    72 │   const loadApiAssets = useCallback(async (signal: AbortSignal) => {
    73 │     const res = await fetch('/api/media/assets', { credentials: 'same-origin', signal });
```

**🔍 AbortController present (good — means fix was applied)**
Line 138: `const ac = new AbortController();`
```
   135 │   useEffect(() => {
   136 │     if (apiFetchStartedRef.current) return;
   137 │     apiFetchStartedRef.current = true;
   138 │     const ac = new AbortController();
   139 │     void (async () => {
   140 │       try {
   141 │         await loadApiAssets(ac.signal);
```
Line 165: `const ac = new AbortController();`
```
   162 │   }, []);
   163 │ 
   164 │   const refresh = useCallback(async () => {
   165 │     const ac = new AbortController();
   166 │     setLoading(true);
   167 │     setErr(null);
   168 │     try {
```

**🔍 API call to /api/media/assets — should fire once on mount only**
Line 73: `const res = await fetch('/api/media/assets', { credentials: 'same-origin', signal });`
```
    70 │   const rootFolderKey = rootHandle?.name ?? '';
    71 │ 
    72 │   const loadApiAssets = useCallback(async (signal: AbortSignal) => {
    73 │     const res = await fetch('/api/media/assets', { credentials: 'same-origin', signal });
    74 │     const data = (await res.json().catch(() => ({}))) as {
    75 │       assets?: Array<Record<string, unknown>>;
    76 │       error?: string;
```

**🔍 Video src binding — check for stale blob URLs**
Line 42: `function revokeLocalBlobUrls(items: MediaLibraryItem[]) {`
```
    39 │   }
    40 │ }
    41 │ 
    42 │ function revokeLocalBlobUrls(items: MediaLibraryItem[]) {
    43 │   for (const i of items) {
    44 │     if (i.source === 'local' && i.previewUrl.startsWith('blob:')) {
    45 │       try {
```
Line 109: `revokeLocalBlobUrls(localBlobItemsRef.current);`
```
   106 │     const handle = rootHandleRef.current;
   107 │     const gen = ++scanGenRef.current;
   108 │     if (!handle) {
   109 │       revokeLocalBlobUrls(localBlobItemsRef.current);
   110 │       localBlobItemsRef.current = [];
   111 │       setItems([]);
   112 │       return;
```
Line 120: `revokeLocalBlobUrls(local);`
```
   117 │     try {
   118 │       await collectMediaFromHandle(handle, '', local);
   119 │       if (gen !== scanGenRef.current) {
   120 │         revokeLocalBlobUrls(local);
   121 │         return;
   122 │       }
   123 │       revokeLocalBlobUrls(localBlobItemsRef.current);
```
Line 123: `revokeLocalBlobUrls(localBlobItemsRef.current);`
```
   120 │         revokeLocalBlobUrls(local);
   121 │         return;
   122 │       }
   123 │       revokeLocalBlobUrls(localBlobItemsRef.current);
   124 │       localBlobItemsRef.current = local;
   125 │       setItems(local);
   126 │     } catch (e) {
```
Line 159: `revokeLocalBlobUrls(localBlobItemsRef.current);`
```
   156 │ 
   157 │   useEffect(() => {
   158 │     return () => {
   159 │       revokeLocalBlobUrls(localBlobItemsRef.current);
   160 │       localBlobItemsRef.current = [];
   161 │     };
   162 │   }, []);
```

**🔍 Blob URL lifecycle — revokeObjectURL must pair with createObjectURL**
Line 28: `const objectUrl = URL.createObjectURL(file);`
```
    25 │     const file = await (entry as FileSystemFileHandle).getFile();
    26 │     const kind = detectFileKind({ name: file.name, contentType: file.type, size: file.size });
    27 │     if (kind !== 'video' && kind !== 'audio' && kind !== 'image') continue;
    28 │     const objectUrl = URL.createObjectURL(file);
    29 │     out.push({
    30 │       id: `local:${path}`,
    31 │       name: file.name,
```
Line 46: `URL.revokeObjectURL(i.previewUrl);`
```
    43 │   for (const i of items) {
    44 │     if (i.source === 'local' && i.previewUrl.startsWith('blob:')) {
    45 │       try {
    46 │         URL.revokeObjectURL(i.previewUrl);
    47 │       } catch {
    48 │         /* ignore */
    49 │       }
```

### `dashboard/features/moviemode/MovieModeStudio.tsx`

_No matching signals in this file._

### `src/api/r2-api.js`

_No matching signals in this file._

### `src/api/agent.js`

_No matching signals in this file._

---

## [EXPLORER_TABS_OPEN]  Explorer sections all expanded on entry

### `dashboard/components/LocalExplorer.tsx`

**🔍 Section defaulting to open=true**
Line 545: `isOpen: true,`
```
   542 │                     name: h.name,
   543 │                     kind: 'directory',
   544 │                     handle: h,
   545 │                     isOpen: true,
   546 │                     children: await getEntries(h),
   547 │                 };
   548 │                 setRootDir(root);
```
Line 566: `isOpen: true,`
```
   563 │                 name: dirHandle.name,
   564 │                 kind: 'directory',
   565 │                 handle: dirHandle,
   566 │                 isOpen: true,
   567 │                 children: await getEntries(dirHandle),
   568 │             };
   569 │             setRootDir(root);
```
Line 649: `setRootDir((prev) => (prev ? mapFileNodeInTree(prev, node, (n) => ({ ...n, isOpen: true, children })) : prev));`
```
   646 │             return;
   647 │         }
   648 │         const children = await getEntries(node.handle);
   649 │         setRootDir((prev) => (prev ? mapFileNodeInTree(prev, node, (n) => ({ ...n, isOpen: true, children })) : prev));
   650 │     };
   651 │ 
   652 │     const handleCreateLocalFile = async () => {
```

**🔍 Section key — check paired state default**
Line 24: `import { MediaLibrary } from '../features/moviemode/MediaLibrary';`
```
    21 │     AlertTriangle,
    22 │     Camera,
    23 │ } from 'lucide-react';
    24 │ import { MediaLibrary } from '../features/moviemode/MediaLibrary';
    25 │ import type { MediaLibraryItem } from '../features/moviemode/types';
    26 │ import type { ActiveFile } from '../types';
    27 │ import { GitHubExplorer } from './GitHubExplorer';
```
Line 25: `import type { MediaLibraryItem } from '../features/moviemode/types';`
```
    22 │     Camera,
    23 │ } from 'lucide-react';
    24 │ import { MediaLibrary } from '../features/moviemode/MediaLibrary';
    25 │ import type { MediaLibraryItem } from '../features/moviemode/types';
    26 │ import type { ActiveFile } from '../types';
    27 │ import { GitHubExplorer } from './GitHubExplorer';
    28 │ import { GoogleDriveExplorer } from './GoogleDriveExplorer';
```
Line 202: `/** Open clip in MovieMode studio (Remotion timeline). */`
```
   199 │     onWorkspaceRootChange?: (info: { folderName: string }) => void;
   200 │     /** Open R2 object in Monaco (same as R2 panel). */
   201 │     onOpenInEditor?: (file: ActiveFile) => void;
   202 │     /** Open clip in MovieMode studio (Remotion timeline). */
   203 │     onOpenMovieMode?: (item: MediaLibraryItem) => void;
   204 │     /** Bumps when Welcome (or parent) should open the native folder picker (showDirectoryPicker). */
   205 │     nativeFolderOpenSignal?: number;
```
Line 203: `onOpenMovieMode?: (item: MediaLibraryItem) => void;`
```
   200 │     /** Open R2 object in Monaco (same as R2 panel). */
   201 │     onOpenInEditor?: (file: ActiveFile) => void;
   202 │     /** Open clip in MovieMode studio (Remotion timeline). */
   203 │     onOpenMovieMode?: (item: MediaLibraryItem) => void;
   204 │     /** Bumps when Welcome (or parent) should open the native folder picker (showDirectoryPicker). */
   205 │     nativeFolderOpenSignal?: number;
   206 │ }> = ({ onFileSelect, onWorkspaceRootChange, onOpenInEditor, onOpenMovieMode, nativeFolderOpenSignal = 0 }) => {
```
Line 206: `}> = ({ onFileSelect, onWorkspaceRootChange, onOpenInEditor, onOpenMovieMode, nativeFolderOpenSignal = 0 }) => {`
```
   203 │     onOpenMovieMode?: (item: MediaLibraryItem) => void;
   204 │     /** Bumps when Welcome (or parent) should open the native folder picker (showDirectoryPicker). */
   205 │     nativeFolderOpenSignal?: number;
   206 │ }> = ({ onFileSelect, onWorkspaceRootChange, onOpenInEditor, onOpenMovieMode, nativeFolderOpenSignal = 0 }) => {
   207 │     const [rootDir, setRootDir] = useState<FileNode | null>(null);
   208 │     /**
   209 │      * When the directory handle cannot be revalidated, show vscode.dev-style resume copy.
```

### `dashboard/App.tsx`

**🔍 Section defaulting to open=true**
Line 882: `sidebarRailExpanded: true,`
```
   879 │ 
   880 │   const shellLayoutRef = useRef({
   881 │     sidebarW: 260,
   882 │     sidebarRailExpanded: true,
   883 │     activityOpen: true,
   884 │   });
   885 │   useEffect(() => {
```
Line 883: `activityOpen: true,`
```
   880 │   const shellLayoutRef = useRef({
   881 │     sidebarW: 260,
   882 │     sidebarRailExpanded: true,
   883 │     activityOpen: true,
   884 │   });
   885 │   useEffect(() => {
   886 │     shellLayoutRef.current = {
```

**🔍 Section key — check paired state default**
Line 86: `const MovieModeStudio = lazy(() =>`
```
    83 │ const LibraryPage = lazy(() => import('./pages/library/LibraryPage'));
    84 │ const WorkflowsPage = lazy(() => import('./pages/workflows/WorkflowsPage'));
    85 │ const WorkflowCanvas = lazy(() => import('./pages/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })));
    86 │ const MovieModeStudio = lazy(() =>
    87 │   import('./features/moviemode/MovieModeStudio').then((m) => ({ default: m.MovieModeStudio })),
    88 │ );
    89 │ 
```
Line 87: `import('./features/moviemode/MovieModeStudio').then((m) => ({ default: m.MovieModeStudio })),`
```
    84 │ const WorkflowsPage = lazy(() => import('./pages/workflows/WorkflowsPage'));
    85 │ const WorkflowCanvas = lazy(() => import('./pages/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })));
    86 │ const MovieModeStudio = lazy(() =>
    87 │   import('./features/moviemode/MovieModeStudio').then((m) => ({ default: m.MovieModeStudio })),
    88 │ );
    89 │ 
    90 │ function DashboardRoutesFallback() {
```
Line 301: `type TabId = 'Workspace' | 'welcome' | 'code' | 'browser' | 'glb' | 'excalidraw' | 'moviemode';`
```
   298 │   const [activeProject] = useState<ProjectType>(ProjectType.SANDBOX);
   299 │ 
   300 │   // IDE State
   301 │   type TabId = 'Workspace' | 'welcome' | 'code' | 'browser' | 'glb' | 'excalidraw' | 'moviemode';
   302 │   const [activeActivity, setActiveActivity] = useState<'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'drive' | 'database' | null>(() =>
   303 │     typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'files',
   304 │   );
```
Line 733: `const [movieModeTimeline, setMovieModeTimeline] = useState<import('./src/types/moviemode').MovieModeTimeline | null>(nul`
```
   730 │   // Tabs: Workspace matches default activeTab (welcome had no panel — stranded tab id removed from defaults).
   731 │   const [openTabs, setOpenTabs] = useState<TabId[]>(['Workspace']);
   732 │   const [activeTab, setActiveTab] = useState<TabId>('Workspace');
   733 │   const [movieModeTimeline, setMovieModeTimeline] = useState<import('./src/types/moviemode').MovieModeTimeline | null>(null);
   734 │   
   735 │   // Derived from EditorContext to minimize massive refactor breakage
   736 │   const activeFile = tabs.find(t => t.id === activeTabId) || null;
```
Line 1303: `const openMovieModeFromExplorer = useCallback(`
```
  1300 │     [openFile, openTab, revealMainWorkspaceIfNarrow],
  1301 │   );
  1302 │ 
  1303 │   const openMovieModeFromExplorer = useCallback(
  1304 │     async (item: import('./features/moviemode/types').MediaLibraryItem) => {
  1305 │       const { createTimelineWithClip } = await import('./features/moviemode/createEmptyTimeline');
  1306 │       setMovieModeTimeline(createTimelineWithClip(item));
```

---

## [EXPLORER_ALIGNMENT]  Explorer stays left when agent moved to right side

### `dashboard/App.tsx`

**🔍 agentPosition state variable**
Line 203: `agentPosition: 'left' | 'right' | 'off';`
```
   200 │   panel: 'sidebar' | 'agent';
   201 │   startWidth: number;
   202 │   deltaX: number;
   203 │   agentPosition: 'left' | 'right' | 'off';
   204 │   min: number;
   205 │   max: number;
   206 │ }): number {
```
Line 211: `raw = args.agentPosition === 'right' ? args.startWidth - args.deltaX : args.startWidth + args.deltaX;`
```
   208 │   if (args.panel === 'sidebar') {
   209 │     raw = args.startWidth + args.deltaX;
   210 │   } else {
   211 │     raw = args.agentPosition === 'right' ? args.startWidth - args.deltaX : args.startWidth + args.deltaX;
   212 │   }
   213 │   return Math.max(args.min, Math.min(args.max, Math.round(raw)));
   214 │ }
```
Line 319: `const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() => {`
```
   316 │     }
   317 │     return true;
   318 │   });
   319 │   const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() => {
   320 │     if (typeof window === 'undefined') return 'right';
   321 │     if (window.innerWidth < 768) return 'off';
   322 │     try {
```
Line 414: `localStorage.setItem(LS_AGENT_POSITION, agentPosition);`
```
   411 │   useEffect(() => {
   412 │     if (typeof window === 'undefined' || isNarrowViewport) return;
   413 │     try {
   414 │       localStorage.setItem(LS_AGENT_POSITION, agentPosition);
   415 │     } catch {
   416 │       /* ignore */
   417 │     }
```
Line 418: `}, [agentPosition, isNarrowViewport]);`
```
   415 │     } catch {
   416 │       /* ignore */
   417 │     }
   418 │   }, [agentPosition, isNarrowViewport]);
   419 │ 
   420 │   useEffect(() => {
   421 │     logDashboardThemeDebug();
```

**🔍 Explorer placement — is it fixed left or reactive to agentPosition?**
Line 17: `import { LocalExplorer } from './components/LocalExplorer';`
```
    14 │ import { XTermShell, XTermShellHandle } from './components/XTermShell';
    15 │ import { ExtensionsPanel } from './components/ExtensionsPanel';
    16 │ import { MonacoEditorView, type EditorModelMeta } from './components/MonacoEditorView';
    17 │ import { LocalExplorer } from './components/LocalExplorer';
    18 │ import { BrowserView } from './components/BrowserView';
    19 │ import { StatusBar, type AgentNotificationRow } from './components/StatusBar';
    20 │ import { ExcalidrawView } from './components/ExcalidrawView';
```
Line 2566: `<LocalExplorer`
```
  2563 │                         <MeetShellPanel />
  2564 │                       </MeetProvider>
  2565 │                   ) : activeActivity === 'files' && location.pathname === '/dashboard/agent' ? (
  2566 │                       <LocalExplorer
  2567 │                           nativeFolderOpenSignal={nativeFolderOpenSignal}
  2568 │                           onWorkspaceRootChange={onExplorerWorkspaceRootChange}
  2569 │                           onFileSelect={openInEditorFromExplorer}
```

**🔍 agentPosition being read to control layout**
Line 203: `agentPosition: 'left' | 'right' | 'off';`
```
   200 │   panel: 'sidebar' | 'agent';
   201 │   startWidth: number;
   202 │   deltaX: number;
   203 │   agentPosition: 'left' | 'right' | 'off';
   204 │   min: number;
   205 │   max: number;
   206 │ }): number {
```
Line 211: `raw = args.agentPosition === 'right' ? args.startWidth - args.deltaX : args.startWidth + args.deltaX;`
```
   208 │   if (args.panel === 'sidebar') {
   209 │     raw = args.startWidth + args.deltaX;
   210 │   } else {
   211 │     raw = args.agentPosition === 'right' ? args.startWidth - args.deltaX : args.startWidth + args.deltaX;
   212 │   }
   213 │   return Math.max(args.min, Math.min(args.max, Math.round(raw)));
   214 │ }
```
Line 307: `const LS_AGENT_POSITION = 'iam_agent_position';`
```
   304 │   );
   305 │   const LS_SIDEBAR_RAIL = 'iam_sidebar_expanded';
   306 │   /** User-chosen agent column side; survives reloads (not overwritten by workspace policy fetch). */
   307 │   const LS_AGENT_POSITION = 'iam_agent_position';
   308 │   const [sidebarRailExpanded, setSidebarRailExpanded] = useState(() => {
   309 │     if (typeof window === 'undefined') return true;
   310 │     try {
```
Line 319: `const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() => {`
```
   316 │     }
   317 │     return true;
   318 │   });
   319 │   const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>(() => {
   320 │     if (typeof window === 'undefined') return 'right';
   321 │     if (window.innerWidth < 768) return 'off';
   322 │     try {
```
Line 414: `localStorage.setItem(LS_AGENT_POSITION, agentPosition);`
```
   411 │   useEffect(() => {
   412 │     if (typeof window === 'undefined' || isNarrowViewport) return;
   413 │     try {
   414 │       localStorage.setItem(LS_AGENT_POSITION, agentPosition);
   415 │     } catch {
   416 │       /* ignore */
   417 │     }
```

**🔍 CSS order/margin trick used for side-switching**
Line 2798: `<div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">`
```
  2795 │                   )}
  2796 │ 
  2797 │                   {/* Quick-open buttons for closed panels */}
  2798 │                   <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
  2799 │                       {!openTabs.includes('browser') && <QuickOpen label="Browser" onClick={() => openTab('browser')} />}
  2800 │                   </div>
  2801 │ 
```

---

## [TOPBAR_POPUP]  Topbar R2 nav is popup/modal instead of inline dropdown

### `dashboard/components/UnifiedSearchBar.tsx`

**🔍 High z-index positioning (popup indicator)**
Line 969: `className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"`
```
   966 │           <button
   967 │             type="button"
   968 │             aria-label="Close search"
   969 │             className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
   970 │             onClick={closePalette}
   971 │           />
   972 │           <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,520px)] z-50">
```
Line 972: `<div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl sh`
```
   969 │             className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
   970 │             onClick={closePalette}
   971 │           />
   972 │           <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,520px)] z-50">
   973 │             <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] space-y-2">
   974 │               <div className="flex items-center gap-2">
   975 │                 <Search size={16} className="text-[var(--text-muted)] shrink-0" />
```
Line 1087: `<div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-3 py-2 rounded-lg border border-[var(--border-subtle`
```
  1084 │       )}
  1085 │ 
  1086 │       {toast ? (
  1087 │         <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[12px] text-[var(--text-main)] shadow-xl">
  1088 │           {toast}
  1089 │         </div>
  1090 │       ) : null}
```

**🔍 Backdrop/overlay — confirms modal pattern**
Line 969: `className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"`
```
   966 │           <button
   967 │             type="button"
   968 │             aria-label="Close search"
   969 │             className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
   970 │             onClick={closePalette}
   971 │           />
   972 │           <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,520px)] z-50">
```
Line 972: `<div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl sh`
```
   969 │             className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
   970 │             onClick={closePalette}
   971 │           />
   972 │           <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,520px)] z-50">
   973 │             <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] space-y-2">
   974 │               <div className="flex items-center gap-2">
   975 │                 <Search size={16} className="text-[var(--text-muted)] shrink-0" />
```

### `dashboard/App.tsx`

**🔍 Search palette open state — drives the popup**
Line 384: `const [searchOpen, setSearchOpen] = useState(false);`
```
   381 │   const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
   382 │   const [agentIsStreaming, setAgentIsStreaming] = useState(false);
   383 │   const [activeCommandRunId, setActiveCommandRunId] = useState<string | null>(null);
   384 │   const [searchOpen, setSearchOpen] = useState(false);
   385 │   const [searchInitialFacets, setSearchInitialFacets] = useState<string[]>([]);
   386 │   const onUnifiedSearchOpenChange = useCallback((next: boolean) => {
   387 │     setSearchOpen(next);
```
Line 386: `const onUnifiedSearchOpenChange = useCallback((next: boolean) => {`
```
   383 │   const [activeCommandRunId, setActiveCommandRunId] = useState<string | null>(null);
   384 │   const [searchOpen, setSearchOpen] = useState(false);
   385 │   const [searchInitialFacets, setSearchInitialFacets] = useState<string[]>([]);
   386 │   const onUnifiedSearchOpenChange = useCallback((next: boolean) => {
   387 │     setSearchOpen(next);
   388 │     if (!next) setSearchInitialFacets([]);
   389 │   }, []);
```
Line 387: `setSearchOpen(next);`
```
   384 │   const [searchOpen, setSearchOpen] = useState(false);
   385 │   const [searchInitialFacets, setSearchInitialFacets] = useState<string[]>([]);
   386 │   const onUnifiedSearchOpenChange = useCallback((next: boolean) => {
   387 │     setSearchOpen(next);
   388 │     if (!next) setSearchInitialFacets([]);
   389 │   }, []);
   390 │   /** Desktop: Draw / Search / History (Addendum A). */
```
Line 2283: `controlledOpen={searchOpen}`
```
  2280 │                 recentFiles={mappedRecentFiles}
  2281 │                 onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
  2282 │                 onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
  2283 │                 controlledOpen={searchOpen}
  2284 │                 onControlledOpenChange={onUnifiedSearchOpenChange}
  2285 │                 initialFacets={searchInitialFacets}
  2286 │               />
```
Line 2284: `onControlledOpenChange={onUnifiedSearchOpenChange}`
```
  2281 │                 onNavigate={(nav, _q) => handleUnifiedNavigate(nav)}
  2282 │                 onRunCommand={(cmd) => terminalRef.current?.runCommand(cmd)}
  2283 │                 controlledOpen={searchOpen}
  2284 │                 onControlledOpenChange={onUnifiedSearchOpenChange}
  2285 │                 initialFacets={searchInitialFacets}
  2286 │               />
  2287 │           </div>
```

**🔍 High z-index positioning (popup indicator)**
Line 1246: `* Mobile: agent chat is `fixed inset-0` above the main workspace. Opening Monaco only`
```
  1243 │   }, [narrowBackToCenter]);
  1244 │ 
  1245 │   /**
  1246 │    * Mobile: agent chat is `fixed inset-0` above the main workspace. Opening Monaco only
  1247 │    * switched `activeTab` while the overlay stayed on top — Context / Open in Monaco looked broken.
  1248 │    */
  1249 │   const revealMainWorkspaceIfNarrow = useCallback(() => {
```
Line 2352: `<div className="absolute right-0 top-full mt-1 z-[120] min-w-[200px] rounded-lg border border-[var(--dashboard-border)] `
```
  2349 │                       <MoreHorizontal size={15} strokeWidth={1.75} />
  2350 │                   </button>
  2351 │                   {topChromeMoreOpen && (
  2352 │                       <div className="absolute right-0 top-full mt-1 z-[120] min-w-[200px] rounded-lg border border-[var(--dashboard-border)] bg-[var(--bg-elevated)] shadow-xl py-1">
  2353 │                           <button
  2354 │                               type="button"
  2355 │                               className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
```
Line 2397: `className="hidden md:flex flex-col py-3 gap-1 px-1 bg-[var(--dashboard-panel)] border-r border-[var(--dashboard-border)]`
```
  2394 │           {/* 2. ACTIVITY BAR (Extreme Left) — hidden ≤768px; use bottom tab bar + More */}
  2395 │           {/* Activity bar: icon rail (width toggled via ☰ — localStorage iam_sidebar_expanded) */}
  2396 │           <div
  2397 │             className="hidden md:flex flex-col py-3 gap-1 px-1 bg-[var(--dashboard-panel)] border-r border-[var(--dashboard-border)] shrink-0 z-50 overflow-x-hidden overflow-y-auto transition-[width] duration-200 ease-in-out"
  2398 │             style={{ width: sidebarRailExpanded ? 180 : 48 }}
  2399 │           >
  2400 │               <ActivityRailItem icon={Home} label="Overview" expanded={sidebarRailExpanded} active={location.pathname === '/dashboard/overview'} onClick={() => navigate('/dashboard/overview')} />
```
Line 2478: `className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 max-md`
```
  2475 │           {agentPosition === 'left' && (
  2476 │               <>
  2477 │                 <div 
  2478 │                     className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 max-md:fixed max-md:inset-0 max-md:z-[45] max-md:w-full max-md:max-w-none max-md:shrink ${
  2479 │                       activeActivity ? 'max-md:hidden' : ''
  2480 │                     }`}
  2481 │                     style={
```
Line 2537: `className="max-md:hidden shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"`
```
  2534 │                   aria-orientation="vertical"
  2535 │                   title="Drag to resize Agent Sam panel"
  2536 │                   aria-label="Resize Agent Sam panel"
  2537 │                   className="max-md:hidden shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"
  2538 │                   style={{ width: AGENT_RESIZER_HIT_PX }}
  2539 │                   onPointerDown={(e) => beginPanelResize('agent', e)}
  2540 │                 >
```

**🔍 Backdrop/overlay — confirms modal pattern**
Line 1247: `* switched `activeTab` while the overlay stayed on top — Context / Open in Monaco looked broken.`
```
  1244 │ 
  1245 │   /**
  1246 │    * Mobile: agent chat is `fixed inset-0` above the main workspace. Opening Monaco only
  1247 │    * switched `activeTab` while the overlay stayed on top — Context / Open in Monaco looked broken.
  1248 │    */
  1249 │   const revealMainWorkspaceIfNarrow = useCallback(() => {
  1250 │     if (isNarrowViewport) narrowBackToCenter();
```
Line 3049: `className="md:hidden fixed inset-x-0 z-[90] flex items-stretch justify-around gap-0 border-t border-[var(--dashboard-bor`
```
  3046 │ 
  3047 │       {/* Mobile (≤768px): bottom tab bar above StatusBar */}
  3048 │       <nav
  3049 │         className="md:hidden fixed inset-x-0 z-[90] flex items-stretch justify-around gap-0 border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/95 backdrop-blur-sm"
  3050 │         style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
  3051 │         aria-label="Primary"
  3052 │       >
```
Line 3102: `className="md:hidden fixed inset-0 z-[95] bg-[var(--text-main)]/25 backdrop-blur-[2px]"`
```
  3099 │         <>
  3100 │           <button
  3101 │             type="button"
  3102 │             className="md:hidden fixed inset-0 z-[95] bg-[var(--text-main)]/25 backdrop-blur-[2px]"
  3103 │             aria-label="Close more tools"
  3104 │             onClick={() => setMobileMoreOpen(false)}
  3105 │           />
```

---

## Summary

| Bug | Signal Hits | Missing Files |
|-----|-------------|---------------|
| 🔴 `HARDCODED_R2` | 22 | 0 |
| 🔴 `GITHUB_REAUTH_LOOP` | 23 | 0 |
| 🔴 `GOOGLE_DRIVE_OAUTH_LOOP` | 11 | 0 |
| 🔴 `MOVIEMODE_BROKEN` | 15 | 0 |
| 🔴 `EXPLORER_TABS_OPEN` | 15 | 0 |
| 🔴 `EXPLORER_ALIGNMENT` | 13 | 0 |
| 🔴 `TOPBAR_POPUP` | 18 | 0 |