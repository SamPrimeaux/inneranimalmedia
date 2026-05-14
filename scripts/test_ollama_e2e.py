#!/usr/bin/env python3
"""
Ollama embedding E2E test — local + tunnel
Usage: source .env.agentsam.local && python3 scripts/test_ollama_e2e.py
"""
import json, sys, time, urllib.request, os

LOCAL_URL     = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
TUNNEL_URL    = 'https://ollama.inneranimalmedia.com'
CF_ID         = os.environ.get('OLLAMA_CF_CLIENT_ID', '')
CF_SECRET     = os.environ.get('OLLAMA_CF_CLIENT_SECRET', '')
MODEL         = 'mxbai-embed-large'
PROMPT        = 'Agent Sam smoke test embedding'
EXPECTED_DIMS = 1024

def embed(url, headers=None):
    h = {'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(
        f'{url}/api/embeddings',
        data=json.dumps({'model': MODEL, 'prompt': PROMPT}).encode(),
        headers=h,
        method='POST'
    )
    t = time.time()
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read())
    ms = round((time.time() - t) * 1000)
    return data.get('embedding', []), ms

def check(label, url, headers=None):
    sys.stdout.write(f'  [{label:<32}] ')
    sys.stdout.flush()
    try:
        emb, ms = embed(url, headers)
        dims = len(emb)
        if dims != EXPECTED_DIMS:
            print(f'✗ FAIL  dims={dims} expected={EXPECTED_DIMS}')
            return False
        sample = [round(x, 4) for x in emb[:3]]
        print(f'✓ PASS  dims={dims}  {ms}ms  sample={sample}')
        return True
    except Exception as e:
        print(f'✗ FAIL  {e}')
        return False

print(f'\n{"═"*62}')
print(f'  Ollama Embedding E2E — model={MODEL}  expected_dims={EXPECTED_DIMS}')
print(f'{"═"*62}\n')

results = []
results.append(check('local  localhost:11434', LOCAL_URL))

print(f'\n{"─"*62}')
print(f'  {sum(results)}/{len(results)} passed\n')
sys.exit(0 if all(results) else 1)
