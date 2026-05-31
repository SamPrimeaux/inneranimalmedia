#!/usr/bin/env bash
# Fair Workers AI model benchmark — Agent Sam routing decisions
# Two test categories:
#   1. Strict classifier  — JSON only, no reasoning, speed matters
#   2. Reasoning quality  — hard debug/analysis prompts, output quality matters
#
# Usage: bash benchmark-fair.sh
# Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN in env

set -euo pipefail

CF_BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

run_model() {
  local model="$1"
  local payload="$2"
  local start end raw

  start=$(python3 -c "import time; print(int(time.time()*1000))")
  raw=$(curl -s "${CF_BASE}/${model}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")
  end=$(python3 -c "import time; print(int(time.time()*1000))")

  # Sanitize control chars that break jq
  local clean
  clean=$(printf '%s' "$raw" | python3 -c '
import sys
s = sys.stdin.read()
s = "".join(ch for ch in s if ch >= " " or ch in "\t\n\r")
print(s)
')

  echo "$clean" | jq \
    --arg model "$model" \
    --argjson latency_ms "$((end - start))" '
    def content:
      if (.result.response? | type) == "object" then (.result.response | tostring)
      elif (.result.response? | type) == "string" then .result.response
      elif (.result.choices?[0].message.content? | type) == "string" then .result.choices[0].message.content
      elif .result.choices?[0].message.reasoning_content? then
        "[reasoning→] " + (.result.choices[0].message.reasoning_content | .[0:300])
      elif .result.choices?[0].message.reasoning? then
        "[reasoning→] " + (.result.choices[0].message.reasoning | .[0:300])
      else (.result | tostring | .[0:300])
      end;
    {
      model:            $model,
      latency_ms:       $latency_ms,
      success:          .success,
      finish_reason:    (.result.choices?[0].finish_reason // null),
      prompt_tokens:    (.result.usage.prompt_tokens // .result.usage.prompt_tokens // null),
      completion_tokens:(.result.usage.completion_tokens // null),
      has_content:      ((.result.choices?[0].message.content? | type) == "string"),
      has_reasoning:    (.result.choices?[0].message.reasoning_content? != null),
      output:           content
    }'
}

section() { echo; echo "════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════"; }
divider() { echo; echo "  ── $1 ──"; }

# --------------------------------------------------------------------------
# TEST CATEGORY 1: Strict JSON classifier
# Who: non-reasoning models only — this is a known kimi weakness, included
#      for completeness but NOT used to judge kimi's overall fitness.
# Fair framing: kimi is a reasoning model. Asking it to suppress reasoning
#   and emit only JSON in 160 tokens is like asking a surgeon to diagnose
#   in one word. Test 1 is included to confirm qwen2.5-coder's classifier
#   role, not to rank kimi.
# --------------------------------------------------------------------------

section "TEST 1 — Strict JSON classifier (qwen2.5-coder home turf)"
echo "  Purpose: confirm qwen2.5-coder for intent_classification task_type"
echo "  Fair note: reasoning models will likely output reasoning here — that"
echo "  is expected and does not reflect their quality on harder tasks."

CLASSIFIER_PROMPT='{
  "messages": [
    {
      "role": "system",
      "content": "You are a strict JSON classifier. Return only valid JSON. No explanation."
    },
    {
      "role": "user",
      "content": "Classify: Fix my D1 migration and verify Worker deploy health.\nSchema: {\"mode\":\"ASK|PLAN|AGENT|DEBUG|MULTITASK\",\"lane\":\"cheap|standard|premium\"}"
    }
  ],
  "max_tokens": 64
}'

for model in \
  "@cf/qwen/qwen2.5-coder-32b-instruct" \
  "@cf/moonshotai/kimi-k2.6" \
  "@cf/meta/llama-4-scout-17b-16e-instruct"
do
  divider "$model"
  run_model "$model" "$CLASSIFIER_PROMPT"
done

# --------------------------------------------------------------------------
# TEST 2: Debug reasoning — kimi's actual use case
# Prompt: a real production log failure requiring root cause analysis.
# This is the kind of task where reasoning models earn their place.
# max_tokens: 1024 so reasoning models can finish and emit output.
# Judged on: output quality + whether content (not just reasoning) is emitted.
# --------------------------------------------------------------------------

section "TEST 2 — Debug root cause analysis (reasoning model home turf)"
echo "  Purpose: find the best model for DEBUG/hard_debug task_type"
echo "  max_tokens: 1024 — reasoning models get room to think AND output"

DEBUG_PROMPT='{
  "messages": [
    {
      "role": "system",
      "content": "You are a senior Cloudflare Workers engineer. Be concise. Give root cause and exact fix location."
    },
    {
      "role": "user",
      "content": "Production log:\n[resolveModel] {\"path\":\"C\",\"model\":\"gemini-3.5-flash\",\"arm\":\"ra_balanced_35flash\",\"source\":\"thompson\"}\n[routing_model] {\"routing_arm_id\":null,\"routing_source\":null,\"chain\":[\"gpt-5.4-nano\"]}\n[applyEto] no_arms_updated {\"routing_arm_id\":null,\"armsUpdated\":0}\n\nRoot cause in 3 bullets. Which function loses the arm_id and where?"
    }
  ],
  "max_tokens": 1024
}'

for model in \
  "@cf/moonshotai/kimi-k2.6" \
  "@cf/qwen/qwen2.5-coder-32b-instruct" \
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b" \
  "@cf/meta/llama-4-scout-17b-16e-instruct"
do
  divider "$model"
  run_model "$model" "$DEBUG_PROMPT"
done

# --------------------------------------------------------------------------
# TEST 3: Code analysis — where kimi was designed to shine
# Prompt: spot the bug in a routing function fragment.
# Judged on: correctness + precision of the identified bug.
# --------------------------------------------------------------------------

section "TEST 3 — Code bug identification (kimi designed for this)"
echo "  Purpose: validate kimi for agentic_code_patch / code review task_type"

CODE_PROMPT='{
  "messages": [
    {
      "role": "system",
      "content": "You are a code reviewer. Identify the exact bug. Be precise and brief."
    },
    {
      "role": "user",
      "content": "Find the bug:\n\nasync function buildRoutingDecision(env, opts) {\n  const resolved = await resolveModelForTask(env, opts);\n  return {\n    selected_arm_id: resolved.routing_arm_id,\n    model_key: resolved.model_key,\n  };\n}\n\n// Later in agent.js:\nasync function dispatchChat(env, body, opts) {\n  const model = await resolveModelForTask(env, {\n    task_type: opts.task_type,\n    mode: opts.mode,\n    requested_model_key: body.model,\n  });\n  return callProvider(env, model.model_key);\n}\n\nWhy does routing_arm_id end up null at dispatch time?"
    }
  ],
  "max_tokens": 1024
}'

for model in \
  "@cf/moonshotai/kimi-k2.6" \
  "@cf/qwen/qwen2.5-coder-32b-instruct" \
  "@cf/meta/llama-4-scout-17b-16e-instruct" \
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
do
  divider "$model"
  run_model "$model" "$CODE_PROMPT"
done

# --------------------------------------------------------------------------
# TEST 4: Multi-step planning — kimi's strongest domain
# Prompt: design a data flow, not just classify.
# Judged on: whether the model produces a structured, correct plan.
# --------------------------------------------------------------------------

section "TEST 4 — Architecture planning (kimi vs field)"
echo "  Purpose: validate kimi for plan / multitask orchestration task_type"

PLAN_PROMPT='{
  "messages": [
    {
      "role": "system",
      "content": "You are a software architect. Be concise. Use bullet points."
    },
    {
      "role": "user",
      "content": "Design the data flow for a routing decision object in an AI agent system. It must: (1) be built once per request, (2) carry arm_id from Thompson sampling through to the provider dispatch, (3) feed usage telemetry, (4) update Thompson arm scores after completion. List the 4 required fields and 3 invariants that prevent arm_id from going null."
    }
  ],
  "max_tokens": 1024
}'

for model in \
  "@cf/moonshotai/kimi-k2.6" \
  "@cf/qwen/qwen2.5-coder-32b-instruct" \
  "@cf/meta/llama-4-scout-17b-16e-instruct"
do
  divider "$model"
  run_model "$model" "$PLAN_PROMPT"
done

echo
echo "════════════════════════════════════════════════════════"
echo "  DONE"
echo "  Scoring guide:"
echo "  Test 1 — JSON compliance only. Kimi expected to fail here."
echo "  Test 2 — Root cause precision. Look for correct file/function."
echo "  Test 3 — Bug identification. Correct answer: dispatchChat calls"
echo "            resolveModelForTask again with body.model, bypassing"
echo "            the arm from buildRoutingDecision."
echo "  Test 4 — Planning quality. Look for: routing_decision_id,"
echo "            selected_arm_id, model_key, provider + 3 invariants."
echo "════════════════════════════════════════════════════════"
