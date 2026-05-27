import os, json, urllib.request, urllib.parse

CF_API_TOKEN  = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
R2_BUCKET     = "inneranimalmedia-autorag"

url = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
       f"/r2/buckets/{R2_BUCKET}/objects?prefix=recipes%2F&limit=5")
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {CF_API_TOKEN}"})
with urllib.request.urlopen(req, timeout=30) as r:
    raw = json.loads(r.read())

print("type:", type(raw))
print("keys:", list(raw.keys()) if isinstance(raw, dict) else "LIST")
print("first 800 chars:", json.dumps(raw)[:800])
