# AgentSam CAD Engineering

Study course for Draw, Design Studio, and real CAD execution lanes.

- **Slug:** `agentsam-cad-engineering`
- **R2:** `learn/agentsam-cad-engineering/`
- **D1 seed:** `migrations/799_agentsam_cad_engineering_course.sql`

Sync:

```bash
python3 scripts/sync_learn_course_to_r2.py agentsam-cad-engineering
```

Apply D1:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --file=./migrations/799_agentsam_cad_engineering_course.sql
```
