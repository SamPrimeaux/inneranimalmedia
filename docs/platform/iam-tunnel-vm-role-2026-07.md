# GCP `iam-tunnel` VM — what it is (and is not)

**Audience:** operators deciding where work should run (Mac asleep, phone, CAD, deploys).  
**Related:** `docs/platform/terminal-three-lane-model.md` · `docs/platform/mac-free-ship-lanes-2026-07.md` · `containers/iam-cad-worker/README.md`

---

## One-line truth

The VM is your **always-on remote shell / terminal / light ops** box. It is **not** the production CAD runner.

---

## Why it feels like the most stable part of the system

| Lane | When it works | Failure mode |
|------|---------------|--------------|
| **Mac local PTY** (`localpty.inneranimalmedia.com`) | You're at the desk, machine awake | Sleeps / lid closed / Wi‑Fi off → Agent Sam can't shell |
| **GCP `iam-tunnel`** (`terminal.inneranimalmedia.com`) | 24/7 Linux host behind Cloudflare Tunnel | Tiny RAM (~1 GB class) — OOM on heavy work |

So for “Agent Sam, run a command while I'm on my phone / Mac is asleep,” the VM is the reliable answer. That is its job.

---

## What the VM **is** for (keep using it)

| Job | How |
|-----|-----|
| **Always-on terminal** | ExecOS / `iam-pty` on the VM → Agent Sam `agentsam_terminal_remote` |
| **Git / wrangler / light shell** when Mac is asleep | Sparse checkout under `/home/samprimeaux/inneranimalmedia` |
| **`npm run ship:remote`** | Push → Cloudflare Builds (never Vite/`deploy:full` on the VM) |
| **Tunnel / DNS edge** | `cloudflared` for `terminal.inneranimalmedia.com` and related routes |
| **Operator SSH** | `gcloud compute ssh iam-tunnel` for self-heal, cron, env sync |

Ship lane law (LOCKED): on this host, **never** run `deploy:full`, `deploy:fast`, Vite, or rclone dashboard sync — they OOM the box. Use `ship:remote` instead.

---

## What the VM **is not** for (do not send here)

| Job | Why it fails | Where it belongs |
|-----|--------------|------------------|
| **OpenSCAD / Blender / FreeCAD CAD jobs** | Too little RAM; toolchain + wrangler fights; historically `execos_exec_failed` | **CF Container** `iam-cad-worker` (`CAD_DISPATCH_TARGET=container`) |
| **Dashboard / Vite builds** | OOM | Mac `deploy:full` / `deploy:fast`, or CF Builds via `ship:remote` |
| **Heavy media / Meshy post-process at scale** | Same memory ceiling | Dedicated container / Workers paths as wired |

Production CAD dispatch is **container-only** — there is no GCP/ExecOS CAD code path. The VM stays for always-on terminal/ops when Mac sleeps.

---

## How CAD used to touch the VM (removed)

Older builds routed Worker → ExecOS on `iam-tunnel` → `cad-job-runner.mjs --once`. That path is **deleted** from production dispatch (`cad-pty-executor.js` removed). CAD is CF container only.
---

## Mental model

```txt
Mac awake     → local PTY (fast, full disk)
Mac asleep    → GCP iam-tunnel (stable shell, tiny)
CAD / 3D jobs → Cloudflare Container iam-cad-worker (sized for Blender)
Ship from VM  → git push + CF Builds (ship:remote), not local Vite
```
