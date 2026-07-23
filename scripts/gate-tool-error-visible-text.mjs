#!/usr/bin/env node
/**
 * Offline repro / proof for tkt_tool_error_visible_text.
 *
 * EXPECT_FAIL=1 → assert the OLD bug class is detectable (raw timeout is "bad").
 * default     → assert synthesizer + formatter never leak raw timeout as assistant text.
 *
 *   EXPECT_FAIL=1 node scripts/gate-tool-error-visible-text.mjs
 *   node scripts/gate-tool-error-visible-text.mjs
 */
import {
  isInternalAgentErrorText,
  synthesizeUserVisibleAgentFailure,
  USER_VISIBLE_TOOL_FAILURE,
} from '../src/core/user-visible-agent-error.js';
import { formatExplicitCatalogToolResult } from '../src/core/format-explicit-catalog-result.js';

const EXPECT_FAIL = String(process.env.EXPECT_FAIL || '') === '1';
const RAW = 'Tool timed out after 1341ms';
const RAW_FAILED = `Tool execution failed: ${RAW}`;

/** Simulates ChatAssistant catch: previous behavior dumped rawMsg into the bubble. */
function simulateUiCatch(rawMsg) {
  return String(rawMsg || '');
}

/** Fixed path: always synthesize before setting assistant content. */
function simulateUiCatchFixed(rawMsg) {
  return synthesizeUserVisibleAgentFailure(rawMsg);
}

const cases = {
  raw_is_internal: isInternalAgentErrorText(RAW),
  raw_failed_is_internal: isInternalAgentErrorText(RAW_FAILED),
  ui_catch_old_leaks: simulateUiCatch(RAW) === RAW,
  ui_catch_fixed: simulateUiCatchFixed(RAW),
  formatter: formatExplicitCatalogToolResult('fs_read_file', RAW_FAILED),
  synth: synthesizeUserVisibleAgentFailure(RAW, { code: 'tool_timeout' }),
};

const fixedOk =
  cases.ui_catch_fixed === USER_VISIBLE_TOOL_FAILURE &&
  cases.formatter === USER_VISIBLE_TOOL_FAILURE &&
  cases.synth === USER_VISIBLE_TOOL_FAILURE &&
  !String(cases.formatter).includes('1341') &&
  !String(cases.ui_catch_fixed).includes('Tool timed out');

const report = {
  ticket: 'tkt_tool_error_visible_text',
  expect_fail: EXPECT_FAIL,
  cases,
  /** Repro class: raw timeout would have been shown as assistant text (old UI catch). */
  repro_class_present: cases.ui_catch_old_leaks && cases.raw_is_internal,
  fixed_ok: fixedOk,
  ok: EXPECT_FAIL
    ? cases.ui_catch_old_leaks && cases.raw_is_internal
    : fixedOk,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
