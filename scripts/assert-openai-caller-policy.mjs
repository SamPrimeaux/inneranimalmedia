/**
 * Local assert for tkt_oai_ptc_schemas — fail-closed caller_policy helpers.
 * Run: node scripts/assert-openai-caller-policy.mjs
 */
import {
  parseCallerPolicy,
  allowedCallersFromCallerPolicy,
  assertCallerAllowedAtInvoke,
  applyDeferLoadingLaw,
  callerPolicyAllowsProgrammatic,
} from '../src/core/openai-caller-policy.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(JSON.stringify(parseCallerPolicy(null)) === '["direct"]', 'null → direct');
assert(JSON.stringify(parseCallerPolicy('')) === '["direct"]', 'empty → direct');
assert(JSON.stringify(parseCallerPolicy('not-json')) === '["direct"]', 'invalid → direct');
assert(
  JSON.stringify(parseCallerPolicy('["direct","programmatic"]')) === '["direct","programmatic"]',
  'dual policy',
);
assert(
  JSON.stringify(allowedCallersFromCallerPolicy('["direct","programmatic"]', { openaiPtcEnabled: false })) ===
    '["direct"]',
  'flag off strips programmatic',
);
assert(
  JSON.stringify(allowedCallersFromCallerPolicy('["direct","programmatic"]', { openaiPtcEnabled: true })) ===
    '["direct","programmatic"]',
  'flag on keeps programmatic',
);
assert(callerPolicyAllowsProgrammatic('["direct"]') === false, 'direct-only');
assert(assertCallerAllowedAtInvoke('["direct"]', { type: 'program' }).ok === false, 'deny program on write');
assert(assertCallerAllowedAtInvoke('["direct","programmatic"]', { type: 'program' }).ok === true, 'allow program');
assert(
  applyDeferLoadingLaw({ type: 'function', name: 'x', defer_loading: true }, ['direct', 'programmatic'])
    .defer_loading !== true,
  'strip defer_loading for programmatic',
);

console.log(JSON.stringify({ ok: true, ticket: 'tkt_oai_ptc_schemas', asserts: 10 }));
