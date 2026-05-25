#!/usr/bin/env node
/**
 * Generate RSA keypair for OIDC id_token (RS256) + public JWKS document.
 *
 * Outputs (gitignored private PEM under .scratch/):
 *   .scratch/oidc-id-token-rsa-private.pem
 *   src/core/oidc-id-token-jwks-published.json  (public only — safe to commit)
 *
 * Install private key on Worker (production):
 *   ./scripts/with-cloudflare-env.sh npx wrangler secret put OIDC_ID_TOKEN_RSA_PRIVATE_KEY \
 *     -c wrangler.production.toml < .scratch/oidc-id-token-rsa-private.pem
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = join(root, '.scratch');
const kid = `iam-oidc-rs256-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

mkdirSync(scratch, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubJwk = publicKey.export({ format: 'jwk' });
delete pubJwk.d;
delete pubJwk.p;
delete pubJwk.q;
delete pubJwk.dp;
delete pubJwk.dq;
delete pubJwk.qi;
pubJwk.kid = kid;
pubJwk.alg = 'RS256';
pubJwk.use = 'sig';

const jwks = { keys: [pubJwk] };

writeFileSync(join(scratch, 'oidc-id-token-rsa-private.pem'), privatePem, { mode: 0o600 });
writeFileSync(
  join(root, 'src/core/oidc-id-token-jwks-published.json'),
  `${JSON.stringify(jwks, null, 2)}\n`,
  'utf8',
);

console.log('Generated OIDC id_token RSA key material.');
console.log(`  kid: ${kid}`);
console.log(`  private PEM: .scratch/oidc-id-token-rsa-private.pem (do not commit)`);
console.log(`  public JWKS: src/core/oidc-id-token-jwks-published.json`);
console.log('');
console.log('Set Worker secret (production):');
console.log(
  '  ./scripts/with-cloudflare-env.sh npx wrangler secret put OIDC_ID_TOKEN_RSA_PRIVATE_KEY \\',
);
console.log('    -c wrangler.production.toml < .scratch/oidc-id-token-rsa-private.pem');
