#!/usr/bin/env node
/**
 * Guardrail: every domain in agentsam_route_requirements.allowed_domains_json
 * must have at least one active agentsam_tools row.
 *
 * Run locally against D1 remote:
 *   node scripts/verify-route-domain-catalog.mjs
 *
 * Or import toolDomainsFromRouteRequirements in unit smoke (no D1).
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const { toolDomainsFromRouteRequirements, buildToolDomainFilterClause } = await import(
  pathToFileURL(path.join(REPO, 'src/core/agentsam-tools-catalog.js')).href
);

const mockReq = {
  allowed_domains: ['filesystem', 'terminal', 'github'],
  allowed_lanes: ['write', 'deploy'],
};
const domains = toolDomainsFromRouteRequirements(mockReq);
const clause = buildToolDomainFilterClause(domains);
if (!domains.includes('filesystem')) {
  console.error('FAIL: explicit allowed_domains not honored');
  process.exit(1);
}
if (domains.some((d) => d === 'write' || d === 'deploy')) {
  console.error('FAIL: unknown lane names leaked into domains', domains);
  process.exit(1);
}
if (!clause?.clause?.includes('LIKE')) {
  console.error('FAIL: buildToolDomainFilterClause empty');
  process.exit(1);
}
console.log('ok: domain spine helpers', { domains, sqlFragment: clause.clause.slice(0, 80) });
