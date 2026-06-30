# IAM sandbox container (`sandbox-v2`)

Remote-stable compute lane for Cloudflare Containers on `inneranimalmedia`.

## Registry (source of truth)

```
registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/meauxcontainer-mycontainer:sandbox-v2
```

Wrangler binds this tag via `MY_CONTAINER` → `MyContainer` DO. Pool instance id: **`inneranimalmedia`** (`CONTAINER_POOL_ID` var — must match worker name).

## API (inside container)

| Method | Path | Body |
|--------|------|------|
| GET | `/health` | — |
| POST | `/exec` | `{ "command": "echo hi", "cwd": "/tmp", "timeout_ms": 30000 }` |

## Build & push

```bash
cd ~/inneranimalmedia
npx wrangler containers build containers/iam-sandbox \
  -t meauxcontainer-mycontainer:sandbox-v2 \
  -p
npm run deploy:full
```

## Worker probes

- `GET /api/internal/my-container/health` — container `/health` (no cold-start avoidance; may take ~30–90s if asleep)
- `POST /api/internal/my-container/exec` — `INTERNAL_API_SECRET` or superadmin session; forwards to container `/exec`

Smoke:

```bash
curl -s https://inneranimalmedia.com/api/internal/my-container/health | jq .

curl -s -X POST https://inneranimalmedia.com/api/internal/my-container/exec \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  -d '{"command":"echo hello from sandbox-v2"}' | jq .
```

## Security

Sam-only smoke lane. Before tenant use: per-workspace paths, command policy, separate pool names.
