#!/usr/bin/env python3
import json
import os
import subprocess
from collections import defaultdict
from pathlib import Path

DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
OUT = Path("analytics/agentsam/commands")
OUT.mkdir(parents=True, exist_ok=True)

def d1(sql):
    cmd = [
        "./scripts/with-cloudflare-env.sh",
        "npx", "wrangler", "d1", "execute", DB,
        "--remote", "--json", "--command", sql
    ]
    raw = subprocess.check_output(cmd, text=True)
    return json.loads(raw)[0]["results"]

commands = d1("""
SELECT
  id,
  workspace_id,
  tenant_id,
  slug,
  display_name,
  description,
  mapped_command,
  command_args,
  category,
  subcategory,
  task_type,
  risk_level,
  requires_confirmation,
  requires_approval,
  timeout_seconds,
  estimated_cost_usd,
  allowed_models_json,
  retry_policy,
  router_type,
  tool_key,
  workflow_key,
  subagent_slug,
  server_key,
  execution_mode,
  is_global,
  route_key,
  success_count,
  failure_count,
  avg_duration_ms
FROM agentsam_commands
WHERE is_active = 1
ORDER BY category, subcategory, risk_level, slug;
""")

summary = d1("""
SELECT
  COALESCE(category, 'uncategorized') AS category,
  COALESCE(subcategory, 'general') AS subcategory,
  COALESCE(task_type, 'unknown') AS task_type,
  COALESCE(risk_level, 'unknown') AS risk_level,
  requires_confirmation,
  requires_approval,
  execution_mode,
  COUNT(*) AS command_count
FROM agentsam_commands
WHERE is_active = 1
GROUP BY category, subcategory, task_type, risk_level, requires_confirmation, requires_approval, execution_mode
ORDER BY category, subcategory, risk_level;
""")

(OUT / "agentsam_commands.json").write_text(json.dumps(commands, indent=2))
(OUT / "agentsam_commands_summary.json").write_text(json.dumps(summary, indent=2))

groups = defaultdict(list)
for c in commands:
    key = f"{c.get('category') or 'uncategorized'}/{c.get('subcategory') or 'general'}"
    groups[key].append(c)

md = []
md.append("# Agent Sam Command Catalog\n")
md.append(f"Total active commands: {len(commands)}\n")
md.append("## Summary\n")
for row in summary:
    md.append(
        f"- `{row['category']}/{row['subcategory']}` "
        f"task={row['task_type']} risk={row['risk_level']} "
        f"confirm={row['requires_confirmation']} approval={row['requires_approval']} "
        f"mode={row['execution_mode']} count={row['command_count']}"
    )

md.append("\n## Commands by Group\n")

for group_key in sorted(groups):
    md.append(f"\n### {group_key}\n")
    for c in groups[group_key]:
        md.append(f"#### {c['slug']} — {c['display_name']}")
        md.append(f"- id: `{c['id']}`")
        md.append(f"- risk: `{c['risk_level']}`")
        md.append(f"- approval: `{c['requires_approval']}` confirmation: `{c['requires_confirmation']}`")
        md.append(f"- timeout: `{c['timeout_seconds']}s` retry: `{c['retry_policy']}`")
        md.append(f"- task_type: `{c['task_type']}` route_key: `{c['route_key']}`")
        md.append(f"- mapped_command: `{c['mapped_command']}`")
        if c.get("description"):
            md.append(f"- description: {c['description']}")
        md.append("")

(OUT / "agentsam_commands_catalog.md").write_text("\n".join(md))

print(f"Wrote {OUT / 'agentsam_commands.json'}")
print(f"Wrote {OUT / 'agentsam_commands_summary.json'}")
print(f"Wrote {OUT / 'agentsam_commands_catalog.md'}")
print(f"Total active commands: {len(commands)}")
