# Workers VPC — MovieMode & IAM private compute

**Lane:** `inneranimalmedia-autorag/docs/platform/` · **Product:** MovieMode + Agent Sam PTY  
**Cloudflare docs:** [Workers VPC](https://developers.cloudflare.com/workers-vpc/)

---

## What Workers VPC is

Workers VPC connects Cloudflare Workers to **private networks** (your cloud, on-prem, or tunnel-backed hosts) without exposing services on the public internet.

IAM uses it today for **PTY / render exec**, not for public dashboard traffic.

---

## IAM production binding

From `wrangler.production.toml`:

```toml
[[vpc_services]]
binding = "PTY_SERVICE"
service_id = "019db639-7c70-7071-8ef3-32ec0392a9ff"
remote = true
```

| Binding | Resolves to | Used for |
|---------|-------------|----------|
| `env.PTY_SERVICE` | Private iam-pty exec HTTP | Remotion render, repo validation, terminal tools, Python on host |

Code path: `src/core/pty-workspace-paths.js` → `execOnPtyHost()` → `PTY_SERVICE.fetch(execUrl, …)`.

MovieMode export: `src/api/moviemode-api.js` → `startRemotionRenderOnPty()`.

---

## VPC patterns for MovieMode (roadmap)

| Pattern | When | MovieMode use |
|---------|------|---------------|
| **VPC Service** (single host) | One private HTTP endpoint | iam-pty exec (today); future `moviemode-render` HTTP API |
| **VPC Network** | Whole tunnel / mesh | Reach render pool + internal metrics without per-host registration |
| **Private S3/R2 gateway** | Bucket not public | CloudConvert `import/s3` / `export/s3` without presigned URL hop |
| **Private database** | Postgres behind tunnel | Only if render service writes directly (prefer Worker + D1 today) |

### Target: render VPC Service (next infra milestone)

Replace shell heredocs over exec with a **private render API**:

```
Dashboard → Main Worker /api/moviemode/export
         → D1 job row
         → VPC fetch POST /render { session, config, jobId }
         → Private host (PTY today / Container later)
         → POST /api/moviemode/ingest (bridge key)
         → ARTIFACTS + D1 complete
```

Same tunnel as PTY; cleaner retries, progress webhooks, and timeouts.

---

## Cloudflare Tunnel setup (reference)

1. Run `cloudflared` on private host (iam-pty machine).
2. Register **VPC Service** in Cloudflare dashboard → Workers VPC → VPC Services.
3. Bind in Wrangler: `[[vpc_services]] binding = "…" service_id = "…"`.
4. Worker calls `env.BINDING.fetch("http://internal-host/path", init)`.

Docs:

- [Get started](https://developers.cloudflare.com/workers-vpc/get-started/)
- [VPC Services](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/)
- [Private S3 bucket example](https://developers.cloudflare.com/workers-vpc/examples/private-s3-bucket/)
- [Route across private services](https://developers.cloudflare.com/workers-vpc/examples/route-across-private-services/)

---

## What NOT to put on VPC

- Dashboard session auth (public HTTPS + cookies)
- R2 reads for logged-in users (`/api/r2/serve`, `/api/artifacts/:id/content`)
- CloudConvert **inbound** webhooks (public `POST /api/webhooks/cloudconvert`)

VPC is **outbound from Worker to private**, not user browser to private.

---

## Container vs PTY on VPC

| | PTY (now) | Container (planned) |
|--|-----------|---------------------|
| Host | Long-lived VM + tunnel | Cloudflare Container image |
| Binding | `PTY_SERVICE` VPC | `MOVIEMODE_RENDER` Container binding on **main worker** |
| Reproducibility | Depends on host Node/Chromium | Pinned image (Remotion + ffmpeg) |
| Scale | Single machine | Horizontal replicas |

**Worker that owns the container:** `inneranimalmedia` (main) — orchestration, auth, D1, ingest.  
**Not** `moviemode-service` (product landing worker stays slim).

---

## Related autorag docs

- `docs/MOVIEMODE-INFRA-PLAN.md` — full strategic plan
- `docs/MOVIEMODE.md` — API + storage lanes
- `docs/platform/worker-env-production-2026-06.md` — bindings and secrets names
