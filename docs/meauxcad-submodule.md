# MeauxCAD / agent-dashboard (deprecated doc)

**Update:** The Agent Dashboard **source is no longer a git submodule**. It is **fully vendored** under **`agent-dashboard/`** in `inneranimalmedia-agentsam-dashboard` so CI and Cloudflare Workers Builds clone **one repository** with no submodule fetch.

The standalone repo **https://github.com/SamPrimeaux/meauxcad** may still be used for **AITestSuite** / lab experiments or as a reference fork; **do not** rely on submodule bump workflows for the IAM monorepo.

## Clone (current)

```bash
git clone https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard.git
cd inneranimalmedia-agentsam-dashboard
```

## Related

- [`docs/AGENT_DASHBOARD.md`](AGENT_DASHBOARD.md) — canonical layout and build paths
- [`docs/AITESTSUITE_IAM_STACK_INTEGRATION.md`](AITESTSUITE_IAM_STACK_INTEGRATION.md) — lab worker vs sandbox vs prod
