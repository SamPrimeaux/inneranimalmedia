#!/usr/bin/env node
/**
 * Offline repro + proof for fs_write_file tool_arguments_json_parse_error on HTML.
 *
 *   EXPECT_FAIL=1 node scripts/gate-fs-write-html-args.mjs  # proves raw JSON.parse fails
 *   node scripts/gate-fs-write-html-args.mjs                 # proves repair restores path/content
 */
import {
  repairTruncatedJson,
  safeJsonParse,
} from '../src/core/tool-arguments-json.js';

const EXPECT_FAIL = String(process.env.EXPECT_FAIL || '') === '1';

/** Truncated mid-string — matches tonight's D1 tails (unterminated content). */
const TRUNCATED = [
  '{"path":".scratch/media-rank-repro.html","content":"<!doctype html>\\n',
  '<html lang=\\"en\\">\\n<head>\\n  <meta charset=\\"utf-8\\" />\\n',
  '  <title>Media Rank</title>\\n  <style>\\n',
  '    body{font-family:\\"Segoe UI\\",sans-serif;background:#f8f7f2}\\n',
  '    .mark:after{content:\\"\\";position:absolute}\\n',
  '    h1{font-size:clamp(51px,7vw,92px);line-height:.',
].join('');

let rawParseOk = true;
try {
  JSON.parse(TRUNCATED);
} catch {
  rawParseOk = false;
}

const repaired = repairTruncatedJson(TRUNCATED);
const viaSafe = safeJsonParse(TRUNCATED);

const report = {
  ticket_hint: 'fs_write_html_tool_args_parse',
  expect_fail: EXPECT_FAIL,
  truncated_len: TRUNCATED.length,
  raw_json_parse_ok: rawParseOk,
  repair_ok: !!(repaired && repaired.path && repaired.content),
  safe_parse_ok: !viaSafe.__parse_error && !!viaSafe.path && !!viaSafe.content,
  repaired_flag: !!viaSafe.__tool_args_repaired,
  path: viaSafe.path || repaired?.path || null,
  content_preview: String(viaSafe.content || repaired?.content || '').slice(0, 120),
};

report.ok = EXPECT_FAIL
  ? report.raw_json_parse_ok === false
  : report.repair_ok && report.safe_parse_ok && report.repaired_flag;

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
