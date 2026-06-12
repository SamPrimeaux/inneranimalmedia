# MeauxContainer on inneranimalmedia

Production uses the **existing** Cloudflare Registry image (not the local Dockerfile stub):

```
registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/meauxcontainer-mycontainer:6d6f76d2
```

- **Dashboard app (orphan):** `meauxcontainer-mycontainer` — created 2026-01-02, 7 warm instances, no worker traffic until `inneranimalmedia` deploys with `MY_CONTAINER` binding.
- **Worker binding:** `env.MY_CONTAINER` → DO class `MyContainer` (`src/do/MyContainer.js`)
- **Health:** `GET /api/internal/my-container/health` (internal auth)
- **MovieMode export:** tries `POST /render` on container → falls back to `PTY_SERVICE` if 404/501

Local `Dockerfile` + `server.mjs` here are optional for future Remotion/ffmpeg v2 builds; push with:

```bash
npx wrangler containers build containers/moviemode-render -t meauxcontainer-mycontainer:v2 -p
```
