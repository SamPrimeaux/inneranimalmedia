# moviemode-service

Shared media pipeline presets and workflow builders for **Inner Animal Media** — used by the main Worker (`inneranimalmedia.com`) and any dedicated encode microservice.

## Canonical source

Production implementations live in the main repo:

| Module | Path |
|--------|------|
| CloudConvert presets + job chains | `src/core/cloudconvert-workflows.js` |
| CloudConvert API client | `src/core/cloudconvert-api.js` |
| MovieMode conversion lane | `src/core/moviemode-conversions.js` |
| Webhook finalizer | `src/core/moviemode-cloudconvert-webhook.js` |

This package mirrors preset definitions for standalone deploys (PTY workers, future Cloudflare Worker encode lane).

## CloudConvert capabilities wired

- **Video encode:** H.264, HEVC, AV1 (+ GPU NVENC preset)
- **Proxy / remux:** 720p proxy, MOV→MP4
- **Thumbnails:** poster frames (`encode-plus-thumb`, `thumbnail-only`)
- **Capture website:** PDF / PNG screenshots
- **Custom ffmpeg:** `command` task with user arguments
- **R2 direct I/O:** `import/s3` + `export/s3` when `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `CLOUDFLARE_ACCOUNT_ID` are set
- **Async webhooks:** `POST /api/webhooks/cloudconvert` → D1 + R2
- **Sync jobs:** `redirect: true` for small tasks (`POST /api/cloudconvert/jobs` with `sync: true`)
- **Operations catalog:** `GET /api/cloudconvert/operations`

## API (main Worker)

```
GET  /api/cloudconvert/presets
GET  /api/cloudconvert/operations?operation=convert&output_format=mp4
POST /api/cloudconvert/jobs
GET  /api/cloudconvert/jobs/:id

POST /api/moviemode/conversions  { service: "cloudconvert", preset: "video-h264-gpu", asset_id }
POST /api/moviemode/conversions  { service: "cloudconvert", preset: "capture-website-pdf", capture_url }
```

## Push to GitHub

```bash
cd services/moviemode-service
git init
git add .
git commit -m "moviemode-service: CloudConvert preset package"
git branch -M main
git remote add origin git@github.com:SamPrimeaux/moviemode-service.git
git push -u origin main
```

## Env

| Secret | Purpose |
|--------|---------|
| `CLOUDCONVERT_API_KEY` | Job create / operations |
| `CLOUDCONVERT_WEBHOOK_SECRET` | Webhook HMAC verify |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Direct S3 import/export |
| `CLOUDFLARE_ACCOUNT_ID` | R2 endpoint host |
