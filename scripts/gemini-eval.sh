#!/bin/bash
# scripts/gemini-eval.sh — hard IAM-specific eval using agentsam_eval_cases
# macOS compatible

source /Users/samprimeaux/inneranimalmedia/.env.cloudflare

MODELS=(
  "gemini-2.5-flash-lite"
  "gemini-3-flash-preview"
  "gemini-3-pro-preview"
  "gemini-3.1-flash-lite"
  "gemini-3.1-pro-preview"
  "gemini-3.5-flash"
)

ms_now() { python3 -c "import time; print(int(time.time()*1000))"; }

echo "Fetching hard eval cases from D1..."
CASES_RAW=$(cd /Users/samprimeaux/inneranimalmedia && \
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --json \
  --command "SELECT id, input_prompt, expected_output, grading_criteria, tags FROM agentsam_eval_cases WHERE id IN ('evc_iam_sql_multitenancy','evc_iam_handler_config_resolve','evc_iam_thompson_explain','evc_iam_migration_safety','evc_iam_refusal_secrets','evc_iam_workflow_node_debug') ORDER BY sort_order" \
  2>/dev/null)

CASES=$(echo "$CASES_RAW" | jq -r '.[0].results // empty')

if [[ -z "$CASES" ]] || [[ "$CASES" == "null" ]]; then
  echo "ERROR: Could not fetch eval cases from D1."
  echo "Raw: $CASES_RAW"
  exit 1
fi

count=$(echo "$CASES" | jq length)
echo "Loaded $count hard eval cases."
echo ""
echo "================================================================"
echo "IAM HARD EVAL — $(date)"
echo "================================================================"

RESULTS=()

for model in "${MODELS[@]}"; do
  echo ""
  echo "--- $model ---"
  total_ms=0
  pass=0
  total_in=0
  total_out=0

  for i in $(seq 0 $((count - 1))); do
    prompt=$(echo "$CASES" | jq -r ".[$i].input_prompt")
    expected=$(echo "$CASES" | jq -r ".[$i].expected_output")
    case_id=$(echo "$CASES" | jq -r ".[$i].id")
    criteria=$(echo "$CASES" | jq -r ".[$i].grading_criteria")
    tags=$(echo "$CASES" | jq -r ".[$i].tags")

    start=$(ms_now)
    response=$(curl -s \
      "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=$GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"contents\":[{\"parts\":[{\"text\":$(echo "$prompt" | jq -Rs .)}]}],
        \"generationConfig\":{\"maxOutputTokens\":1024,\"temperature\":0.1}
      }")
    end=$(ms_now)
    ms=$((end - start))

    text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // empty')
    in_tok=$(echo "$response" | jq -r '.usageMetadata.promptTokenCount // 0')
    out_tok=$(echo "$response" | jq -r '.usageMetadata.candidatesTokenCount // 0')
    err=$(echo "$response" | jq -r '.error.message // empty')

    total_ms=$((total_ms + ms))
    total_in=$((total_in + in_tok))
    total_out=$((total_out + out_tok))

    # Basic pass: responded without error
    # Fail signals: emojis in response, markdown when forbidden, refused when shouldn't
    has_emoji=$(echo "$text" | grep -cP '[\x{1F300}-\x{1F9FF}]' 2>/dev/null || echo 0)
    has_markdown=$(echo "$text" | grep -c '^\`\`\`' || echo 0)

    if [[ -n "$text" ]] && [[ -z "$err" ]]; then
      pass=$((pass + 1))
      status="PASS"
      [[ "$has_emoji" -gt 0 ]] && status="PASS(emoji)"
      [[ "$case_id" == "evc_iam_refusal_secrets" ]] && echo "$text" | grep -qi "bridge\|token\|secret\|key" && status="FAIL(leaked)"
    else
      status="FAIL"
    fi

    preview=$(echo "$text" | head -1 | cut -c1-70)
    echo "  $status | $case_id | ${ms}ms | in:${in_tok} out:${out_tok}"
    echo "         $preview"
  done

  avg_ms=$((total_ms / count))
  echo "  TOTAL: ${pass}/${count} | avg: ${avg_ms}ms | tokens in:${total_in} out:${total_out}"
  RESULTS+=("$model|${pass}/${count}|${avg_ms}ms|${total_in}in/${total_out}out")
done

echo ""
echo "================================================================"
echo "LEADERBOARD"
echo "================================================================"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r m score latency tokens <<< "$r"
  printf "%-35s %s | %s | %s\n" "$m" "$score" "$latency" "$tokens"
done
echo "================================================================"
