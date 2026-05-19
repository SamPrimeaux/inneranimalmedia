#!/usr/bin/env python3
"""
iam_gemini_model_sync.py
========================
Syncs all available Gemini models into agentsam_model_catalog
with accurate pricing from Google's official docs (updated May 14 2026).
Also seeds agentsam_routing_arms with initial Thompson Sampling priors.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/iam_gemini_model_sync.py

  # Dry run — print SQL only, no D1 writes:
  DRY_RUN=1 ./scripts/with-cloudflare-env.sh python3 scripts/iam_gemini_model_sync.py

  # Skip routing arms seeding:
  SKIP_ARMS=1 ./scripts/with-cloudflare-env.sh python3 scripts/iam_gemini_model_sync.py
"""

import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
import google.genai as genai

load_dotenv(Path(__file__).parent.parent / ".env.cloudflare")
load_dotenv(Path(__file__).parent.parent / ".env")

REPO_ROOT  = Path(__file__).parent.parent.resolve()
DRY_RUN    = os.getenv("DRY_RUN",   "0") == "1"
SKIP_ARMS  = os.getenv("SKIP_ARMS", "0") == "1"
SAM_WS     = "ws_inneranimalmedia"

# ── Model catalog ─────────────────────────────────────────────────────────────
# cost_per_1k_in / out = Google standard tier price ÷ 1000
# tier: micro | flash | standard | power | reasoning

CATALOG = [
    # MICRO
    {"model_key":"gemini-3.1-flash-lite","display_name":"Gemini 3.1 Flash Lite","google_model_id":"gemini-3.1-flash-lite","tier":"micro","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.00025,"cost_per_1k_out":0.0015,"cost_notes":"Batch/Flex $0.125/$0.75 per 1M. Priority $0.45/$2.70. Audio in $0.50/1M.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3.1-flash-lite-preview","display_name":"Gemini 3.1 Flash Lite Preview","google_model_id":"gemini-3.1-flash-lite-preview","tier":"micro","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.00025,"cost_per_1k_out":0.0015,"cost_notes":"Same pricing as stable. Preview — pin stable for prod.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-2.5-flash-lite","display_name":"Gemini 2.5 Flash Lite","google_model_id":"gemini-2.5-flash-lite","tier":"micro","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.0001,"cost_per_1k_out":0.0004,"cost_notes":"Batch/Flex $0.05/$0.20. Audio in $0.30/1M.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemma-4-26b-a4b-it","display_name":"Gemma 4 26B","google_model_id":"gemma-4-26b-a4b-it","tier":"micro","context_window":131_072,"max_output_tokens":8_192,"cost_per_1k_in":0.0,"cost_per_1k_out":0.0,"cost_notes":"Free tier only on Google AI. CF Workers AI: $0.10/$0.30 per 1M.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},


    # FLASH
    {"model_key":"gemini-2.5-flash","display_name":"Gemini 2.5 Flash","google_model_id":"gemini-2.5-flash","tier":"flash","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.0003,"cost_per_1k_out":0.0025,"cost_notes":"Audio in $1/1M. Batch/Flex $0.15/$1.25. Priority $0.54/$4.50.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":1,"reasoning_effort":"medium","is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3-flash-preview","display_name":"Gemini 3 Flash Preview","google_model_id":"gemini-3-flash-preview","tier":"flash","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.0005,"cost_per_1k_out":0.003,"cost_notes":"Preview. Better middle tier for agent planning and multimodal.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemma-4-31b-it","display_name":"Gemma 4 31B","google_model_id":"gemma-4-31b-it","tier":"flash","context_window":131_072,"max_output_tokens":8_192,"cost_per_1k_in":0.0,"cost_per_1k_out":0.0,"cost_notes":"Free tier only on Google AI. Paid tier not available.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-2.5-flash-image","display_name":"Gemini 2.5 Flash Image","google_model_id":"gemini-2.5-flash-image","tier":"flash","context_window":65_536,"max_output_tokens":32_768,"cost_per_1k_in":0.0003,"cost_per_1k_out":0.039,"cost_notes":"Output $0.039/image standard. Batch $0.0195/image. Input text/image $0.30/1M.","supports_tools":0,"supports_vision":1,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3.1-flash-image-preview","display_name":"Gemini 3.1 Flash Image Preview","google_model_id":"gemini-3.1-flash-image-preview","tier":"flash","context_window":131_072,"max_output_tokens":32_768,"cost_per_1k_in":0.0005,"cost_per_1k_out":0.045,"cost_notes":"~$0.045/0.5K img, $0.067/1K, $0.101/2K, $0.151/4K. Input $0.50/1M.","supports_tools":0,"supports_vision":1,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-2.5-flash-preview-tts","display_name":"Gemini 2.5 Flash TTS","google_model_id":"gemini-2.5-flash-preview-tts","tier":"flash","context_window":8_192,"max_output_tokens":16_384,"cost_per_1k_in":0.0005,"cost_per_1k_out":0.01,"cost_notes":"Text in $0.50/1M. Audio out $10/1M. Batch $0.25/$5.","supports_tools":0,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3.1-flash-tts-preview","display_name":"Gemini 3.1 Flash TTS Preview","google_model_id":"gemini-3.1-flash-tts-preview","tier":"flash","context_window":8_192,"max_output_tokens":16_384,"cost_per_1k_in":0.0005,"cost_per_1k_out":0.01,"cost_notes":"Preview. Follows 3.1 Flash Live/Audio pricing family.","supports_tools":0,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},


    # STANDARD
    {"model_key":"gemini-2.5-pro","display_name":"Gemini 2.5 Pro","google_model_id":"gemini-2.5-pro","tier":"standard","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.00125,"cost_per_1k_out":0.01,"cost_notes":">200k: $2.50/$15 per 1M. Batch $0.625/$5. Priority $2.25/$18.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-2.5-pro-preview-tts","display_name":"Gemini 2.5 Pro TTS","google_model_id":"gemini-2.5-pro-preview-tts","tier":"standard","context_window":8_192,"max_output_tokens":16_384,"cost_per_1k_in":0.001,"cost_per_1k_out":0.02,"cost_notes":"Text in $1/1M. Audio out $20/1M. Batch $0.50/$10.","supports_tools":0,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},


    # POWER
    {"model_key":"gemini-3.1-pro-preview","display_name":"Gemini 3.1 Pro Preview","google_model_id":"gemini-3.1-pro-preview","tier":"power","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.002,"cost_per_1k_out":0.012,"cost_notes":">200k: $4/$18 per 1M. Batch $1/$6. Priority $3.60/$21.60.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3.1-pro-preview-customtools","display_name":"Gemini 3.1 Pro Preview Custom Tools","google_model_id":"gemini-3.1-pro-preview-customtools","tier":"power","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.002,"cost_per_1k_out":0.012,"cost_notes":"Same as 3.1 Pro. Use only when custom tools endpoint required.","supports_tools":1,"supports_vision":1,"supports_streaming":1,"supports_json_mode":1,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
    {"model_key":"gemini-3-pro-image-preview","display_name":"Gemini 3 Pro Image Preview","google_model_id":"gemini-3-pro-image-preview","tier":"power","context_window":65_536,"max_output_tokens":32_768,"cost_per_1k_in":0.002,"cost_per_1k_out":0.134,"cost_notes":"~$0.134/1K-2K img, $0.24/4K. Input text/image $2/1M.","supports_tools":0,"supports_vision":1,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":0,"reasoning_effort":None,"is_active":1,"api_platform":"google_ai"},

    # REASONING
    {"model_key":"deep-research-preview-04-2026","display_name":"Deep Research Preview","google_model_id":"deep-research-preview-04-2026","tier":"reasoning","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.0003,"cost_per_1k_out":0.0025,"cost_notes":"Billed by underlying model tokens + tool usage. Cited research reports.","supports_tools":1,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
    {"model_key":"deep-research-max-preview-04-2026","display_name":"Deep Research Max Preview","google_model_id":"deep-research-max-preview-04-2026","tier":"reasoning","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.002,"cost_per_1k_out":0.012,"cost_notes":"Max comprehensiveness. Billed by underlying Pro tokens + tool usage.","supports_tools":1,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
    {"model_key":"deep-research-pro-preview-12-2025","display_name":"Deep Research Pro Preview","google_model_id":"deep-research-pro-preview-12-2025","tier":"reasoning","context_window":1_048_576,"max_output_tokens":65_536,"cost_per_1k_in":0.002,"cost_per_1k_out":0.012,"cost_notes":"Powered by 3.1 Pro. Pro pricing + tool usage.","supports_tools":1,"supports_vision":0,"supports_streaming":1,"supports_json_mode":0,"supports_reasoning":1,"reasoning_effort":"high","is_active":1,"api_platform":"google_ai"},
]

PURGE_KEYS = [
    "gemini-2.0-flash", "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001",
    "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest",
    "gemini-robotics-er-1.5-preview",
    "gemini-robotics-er-1.6-preview",
    "gemini-2.5-computer-use-preview-10-2025",
    "lyria-3-clip-preview",
    "lyria-3-pro-preview",
    "nano-banana-pro-preview",  # marketing name = gemini-3-pro-image-preview
    "gemini-3-pro-preview",     # shut down per Google docs
]

ROUTING_ARMS = [
    {"task_type":"classify",  "mode":"auto", "model_key":"gemini-3.1-flash-lite",          "priority":90},
    {"task_type":"extract",   "mode":"auto", "model_key":"gemini-3.1-flash-lite",          "priority":90},
    {"task_type":"translate", "mode":"auto", "model_key":"gemini-3.1-flash-lite",          "priority":90},
    {"task_type":"summarize", "mode":"auto", "model_key":"gemini-2.5-flash-lite",          "priority":80},
    {"task_type":"agent",     "mode":"auto", "model_key":"gemini-2.5-flash",               "priority":70},
    {"task_type":"agent",     "mode":"ask",  "model_key":"gemini-3-flash-preview",         "priority":65},
    {"task_type":"code",      "mode":"auto", "model_key":"gemini-2.5-flash",               "priority":75},
    {"task_type":"plan",      "mode":"auto", "model_key":"gemini-3.1-pro-preview",         "priority":60},
    {"task_type":"review",    "mode":"auto", "model_key":"gemini-3.1-pro-preview",         "priority":55},
    {"task_type":"research",  "mode":"auto", "model_key":"deep-research-preview-04-2026",  "priority":50},
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def q(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def run_d1(sql):
    if DRY_RUN:
        print(sql); print(); return True
    r = subprocess.run(
        ["npx","wrangler","d1","execute","inneranimalmedia-business",
         "--remote","-c", str(REPO_ROOT/"wrangler.production.toml"),
         "--command", sql],
        capture_output=True, text=True, cwd=REPO_ROOT, env=os.environ.copy()
    )
    if r.returncode != 0:
        log(f"  [D1 ERROR] {r.stderr[:300]}"); return False
    return True

def catalog_upsert(m):
    now = int(datetime.now(timezone.utc).timestamp())
    return (
        f"INSERT INTO agentsam_model_catalog "
        f"(model_key,display_name,provider,tier,google_model_id,"
        f"context_window,max_output_tokens,cost_per_1k_in,cost_per_1k_out,"
        f"cost_notes,supports_tools,supports_vision,supports_streaming,"
        f"supports_json_mode,supports_reasoning,reasoning_effort,"
        f"is_active,api_platform,updated_at) VALUES ("
        f"{q(m['model_key'])},{q(m['display_name'])},{q('google')},{q(m['tier'])},"
        f"{q(m['google_model_id'])},{q(m['context_window'])},{q(m['max_output_tokens'])},"
        f"{q(m['cost_per_1k_in'])},{q(m['cost_per_1k_out'])},{q(m.get('cost_notes'))},"
        f"{q(m.get('supports_tools',1))},{q(m.get('supports_vision',0))},"
        f"{q(m.get('supports_streaming',1))},{q(m.get('supports_json_mode',0))},"
        f"{q(m.get('supports_reasoning',0))},{q(m.get('reasoning_effort'))},"
        f"{q(m.get('is_active',1))},{q(m.get('api_platform','google_ai'))},{q(now)}) "
        f"ON CONFLICT(model_key) DO UPDATE SET "
        f"display_name=excluded.display_name,tier=excluded.tier,"
        f"google_model_id=excluded.google_model_id,"
        f"context_window=excluded.context_window,max_output_tokens=excluded.max_output_tokens,"
        f"cost_per_1k_in=excluded.cost_per_1k_in,cost_per_1k_out=excluded.cost_per_1k_out,"
        f"cost_notes=excluded.cost_notes,supports_tools=excluded.supports_tools,"
        f"supports_vision=excluded.supports_vision,supports_reasoning=excluded.supports_reasoning,"
        f"reasoning_effort=excluded.reasoning_effort,is_active=excluded.is_active,"
        f"api_platform=excluded.api_platform,updated_at=excluded.updated_at;"
    )

def arm_upsert(arm):
    now = int(datetime.now(timezone.utc).timestamp())
    return (
        f"INSERT INTO agentsam_routing_arms "
        f"(workspace_id,task_type,mode,model_key,provider,priority,is_active,is_eligible,supports_tools,updated_at) "
        f"VALUES ({q(SAM_WS)},{q(arm['task_type'])},{q(arm['mode'])},{q(arm['model_key'])},"
        f"{q('google')},{q(arm['priority'])},1,1,1,{q(now)}) "
        f"ON CONFLICT(workspace_id,task_type,mode,model_key) DO UPDATE SET "
        f"priority=excluded.priority,is_active=1,updated_at=excluded.updated_at;"
    )

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key: log("[ERROR] GEMINI_API_KEY not set"); sys.exit(1)

    genai.configure(api_key=api_key)
    available = {m.name.replace("models/","") for m in genai.list_models()
                 if "generateContent" in m.supported_generation_methods}
    log(f"API reports {len(available)} content models available")

    to_seed = [m for m in CATALOG if m["model_key"] not in PURGE_KEYS]

    # Pricing table
    print("\n" + "="*105)
    print(f"{'MODEL':<48} {'TIER':<10} {'IN$/1K':>8} {'OUT$/1K':>9} {'CTX':>10}  STATUS")
    print("="*105)
    for m in sorted(to_seed, key=lambda x: (x["tier"], x["model_key"])):
        in_api = m["model_key"] in available
        status = "✓ in API" if in_api else "- not in API"
        if not m.get("is_active",1): status = "✗ deprecated"
        print(f"{m['model_key']:<48} {m['tier']:<10} "
              f"${m['cost_per_1k_in']:>7.5f} ${m['cost_per_1k_out']:>8.5f} "
              f"{m['context_window']:>10,}  {status}")
    print("="*105)
    print(f"To seed: {len(to_seed)}")

    if DRY_RUN: print("\n--- DRY RUN: catalog SQL ---")
    log(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Writing {len(to_seed)} models to agentsam_model_catalog...")
    ok = fail = 0
    for m in to_seed:
        if run_d1(catalog_upsert(m)): ok += 1
        else: fail += 1
    log(f"Catalog: {ok} upserted, {fail} failed")

    if not SKIP_ARMS:
        if DRY_RUN: print("\n--- DRY RUN: routing arms SQL ---")
        log(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Seeding {len(ROUTING_ARMS)} routing arms...")
        ok2 = fail2 = 0
        for arm in ROUTING_ARMS:
            if run_d1(arm_upsert(arm)): ok2 += 1
            else: fail2 += 1
        log(f"Arms: {ok2} upserted, {fail2} failed")

    # Purge deprecated models from D1
    purge_keys = ",".join(f"'{k}'" for k in PURGE_KEYS)
    log(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Purging {len(PURGE_KEYS)} deprecated models from D1...")
    run_d1(f"DELETE FROM agentsam_model_catalog WHERE model_key IN ({purge_keys});")
    run_d1(f"DELETE FROM agentsam_routing_arms WHERE model_key IN ({purge_keys});")

    if not DRY_RUN:
        log("Verifying...")
        run_d1("SELECT model_key,tier,cost_per_1k_in,cost_per_1k_out,is_active "
               "FROM agentsam_model_catalog WHERE provider='google' ORDER BY tier,model_key;")

    log("Done." if not DRY_RUN else "Dry run complete — no D1 writes made.")

if __name__ == "__main__":
    main()
