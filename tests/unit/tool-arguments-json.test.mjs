import test from 'node:test';
import assert from 'node:assert/strict';
import {
  repairTruncatedJson,
  safeJsonParse,
  toolArgumentsParseErrorMessage,
} from '../../src/core/tool-arguments-json.js';

test('safeJsonParse accepts valid HTML tool args with quotes', () => {
  const args = JSON.stringify({
    path: '.scratch/demo.html',
    content: '<!doctype html>\n<html lang="en">\n<meta charset="utf-8" />\n<style>.x:after{content:""}</style>',
  });
  const parsed = safeJsonParse(args);
  assert.equal(parsed.__parse_error, undefined);
  assert.equal(parsed.path, '.scratch/demo.html');
  assert.match(String(parsed.content), /lang="en"/);
  assert.match(String(parsed.content), /content:""/);
});

test('repairTruncatedJson closes truncated HTML content string', () => {
  // Simulate model cut-off mid-content (the live failure class).
  const truncated =
    '{"path":".scratch/media-rank.html","content":"<!doctype html>\\n<html lang=\\"en\\">\\n<head>\\n  <meta charset=\\"utf-8\\" />\\n  <style>body{font-family:\\"Segoe UI\\",sans-serif}';
  assert.throws(() => JSON.parse(truncated));
  const repaired = repairTruncatedJson(truncated);
  assert.ok(repaired);
  assert.equal(repaired.path, '.scratch/media-rank.html');
  assert.match(String(repaired.content), /doctype html/i);
  assert.match(String(repaired.content), /Segoe UI/);
});

test('safeJsonParse marks repaired truncated args', () => {
  const truncated =
    '{"path":".scratch/x.html","content":"<!doctype html>\\n<html lang=\\"en\\"><body><h1>Hello';
  const parsed = safeJsonParse(truncated);
  assert.equal(parsed.__parse_error, undefined);
  assert.equal(parsed.__tool_args_repaired, true);
  assert.equal(parsed.path, '.scratch/x.html');
  assert.match(String(parsed.content), /Hello/);
});

test('toolArgumentsParseErrorMessage is actionable for fs_write_file', () => {
  const msg = toolArgumentsParseErrorMessage('fs_write_file');
  assert.match(msg, /truncated|cut off|shorter|two steps/i);
  assert.equal(msg.includes('tool_arguments_json_parse_error'), false);
});
