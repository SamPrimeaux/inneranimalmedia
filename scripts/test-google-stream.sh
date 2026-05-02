#!/usr/bin/env bash
# test-google-stream.sh — Google streaming smoke test
# Usage: ./scripts/test-google-stream.sh [sandbox|prod]
set -euo pipefail

TARGET="${1:-sandbox}"
if [ "$TARGET" = "prod" ]; then
  BASE_URL="https://inneranimalmedia.com"
  SESSION_COOKIE="d445ee8a-4a67-4d0c-aaae-6793922ad1a9"
  ENV_LABEL="production (Google OAuth)"
else
  BASE_URL="https://inneranimal-dashboard.meauxbility.workers.dev"
  SESSION_COOKIE="77197ff3-e1f6-4ef1-a6ac-6353b037725d"
  ENV_LABEL="sandbox (internal login)"
fi

echo "=== GOOGLE STREAM SMOKE TEST ==="
echo "  Target : $TARGET ($ENV_LABEL)"
echo "  URL    : $BASE_URL"
echo ""

# ── Verify session is valid ───────────────────────────────────────────────────
echo "  Checking session..."
SESSION_CHECK=$(curl -sf "$BASE_URL/api/session" \
  -H "Cookie: session=$SESSION_COOKIE" 2>/dev/null || echo "{}")
SESSION_USER=$(python3 -c "
import sys, json
try:
  d = json.loads('$SESSION_CHECK'.replace(\"'\", '\"'))
  print(d.get('user', {}).get('email') or d.get('email') or d.get('user_id') or 'unknown')
except:
  print('unknown')
" 2>/dev/null || echo "unknown")
echo "  Session: $SESSION_USER"
echo ""

# ── Find active Google model ──────────────────────────────────────────────────
MODELS_RAW=$(curl -sf "$BASE_URL/api/agent/models" \
  -H "Cookie: session=$SESSION_COOKIE" 2>/dev/null || echo "[]")

GOOGLE_MODEL=$(python3 -c "
import sys, json
try:
  data = json.loads('''$MODELS_RAW''')
  arr = data if isinstance(data, list) else data.get('models', data.get('data', []))
  g = next((m for m in arr if m.get('provider') == 'google' and m.get('is_active')), None)
  if g:
    print(g.get('id') or g.get('model_key') or 'NOT_FOUND')
  else:
    print('NOT_FOUND')
except:
  print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")

if [ "$GOOGLE_MODEL" = "NOT_FOUND" ]; then
  GOOGLE_MODEL="gemini-2.5-flash"
  echo "  Model  : $GOOGLE_MODEL (fallback)"
else
  echo "  Model  : $GOOGLE_MODEL"
fi

echo "  Prompt : 'Count from 1 to 5, one number per line.'"
echo ""
echo "  Response:"
echo "  ──────────────────────────────────────────"

# ── Stream ────────────────────────────────────────────────────────────────────
curl -sN "$BASE_URL/api/agent/chat" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION_COOKIE" \
  --data "{
    \"messages\": [{\"role\":\"user\",\"content\":\"Count from 1 to 5, one number per line. Nothing else.\"}],
    \"model_id\": \"$GOOGLE_MODEL\",
    \"stream\": true
  }" | python3 -c "
import sys, json, time

chunks = 0
full_text = ''
done_data = {}
start = time.time()
first_chunk_ms = None

for line in sys.stdin:
    line = line.strip()
    if not line or not line.startswith('data: '):
        continue
    raw = line[6:]
    try:
        d = json.loads(raw)
    except:
        continue
    t = d.get('type', '')
    if t == 'text':
        chunks += 1
        text = d.get('text', '')
        full_text += text
        if first_chunk_ms is None:
            first_chunk_ms = int((time.time() - start) * 1000)
        sys.stdout.write(text)
        sys.stdout.flush()
    elif t == 'done':
        done_data = d
    elif t == 'error':
        print(f'\n  ERROR: {d.get(\"error\",\"unknown\")}')
        sys.exit(1)

elapsed = int((time.time() - start) * 1000)
print('\n  ──────────────────────────────────────────')
print(f'  Time        : {elapsed}ms total | first chunk: {first_chunk_ms or \"N/A\"}ms')
print(f'  Chunks      : {chunks}')
print(f'  Tokens in   : {done_data.get(\"input_tokens\", \"?\")}')
print(f'  Tokens out  : {done_data.get(\"output_tokens\", \"?\")}')
print(f'  Cost USD    : \${done_data.get(\"cost_usd\", \"?\")}')
print(f'  Model used  : {done_data.get(\"model_used\", \"?\")}')
print(f'  Conv ID     : {done_data.get(\"conversation_id\", \"?\")}')
print()
if chunks > 2:
    print('  RESULT: STREAMING — multiple chunks received correctly')
elif chunks == 1:
    print('  RESULT: WARN — single chunk, still blocking')
elif chunks == 0:
    print('  RESULT: FAIL — no chunks received')
"

echo ""
echo "=== TEST COMPLETE ==="
