import sys
cur, nxt, path = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
out = src.replace(f'?v={cur}', f'?v={nxt}')
open(path, 'w').write(out)
print(f'  Cache version: v={cur} -> v={nxt}')
