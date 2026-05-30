import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFileBlocksImageGeneration,
  activeFilePathLooksLikeCode,
  applyActiveFileDefaultsToToolInput,
  extractOpenFileContentFromMessage,
  formatActiveFileForAgent,
  parseActiveFileEnvelope,
  stripUserTextForIntent,
} from '../../src/core/active-file-envelope.js';
import { isCodeImplementationIntent } from '../../src/core/code-implementation-intent.js';

const CSS_ON_DEMAND = `

--- On-demand context (this message only) ---
### Open file (editor)
dashboard/styles.css

.hero-banner {
  background: linear-gradient(180deg, #111, #222);
}
.thumbnail-preview { width: 120px; }
.icon-row { display: flex; }
`;

test('activeFilePathLooksLikeCode recognizes code extensions', () => {
  assert.equal(activeFilePathLooksLikeCode('src/main.jsx'), true);
  assert.equal(activeFilePathLooksLikeCode('styles.css'), true);
  assert.equal(activeFilePathLooksLikeCode('hero.png'), false);
});

test('refactoring monaco css is code implementation — not stripped by on-demand CSS', () => {
  const user = 'how would you propose refactoring the .css in our monaco?';
  const message = `${user}${CSS_ON_DEMAND}`;
  assert.equal(isCodeImplementationIntent(user), true);
  assert.equal(isCodeImplementationIntent(message), true);
  assert.equal(stripUserTextForIntent(message), user);
});

test('active code file envelope blocks image generation lane guard', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_path: 'dashboard/main.jsx',
    active_file_content: 'export function Hero() { return <div className="banner" />; }',
  });
  assert.ok(activeFileBlocksImageGeneration(envelope));
});

test('formatActiveFileForAgent includes github repo and write tool hints with content', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_source: 'github',
    active_file_github_repo: 'SamPrimeaux/chrystal-clear-insurance',
    active_file_github_path: 'src/main.jsx',
    active_file_github_branch: 'main',
    active_file_content: 'export function App() {}',
  });
  const text = formatActiveFileForAgent(envelope);
  assert.match(text, /SamPrimeaux\/chrystal-clear-insurance\/src\/main\.jsx/);
  assert.match(text, /github_update_file/);
  assert.match(text, /export function App/);
});

test('applyActiveFileDefaultsToToolInput fills github repo and path', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_github_repo: 'SamPrimeaux/chrystal-clear-insurance',
    active_file_github_path: 'src/main.jsx',
    active_file_github_branch: 'main',
  });
  const out = applyActiveFileDefaultsToToolInput('github_update_file', {}, envelope);
  assert.equal(out.repo, 'SamPrimeaux/chrystal-clear-insurance');
  assert.equal(out.path, 'src/main.jsx');
  assert.equal(out.branch, 'main');
});

test('extractOpenFileContentFromMessage pulls editor buffer from on-demand block', () => {
  const content = extractOpenFileContentFromMessage(`audit this${CSS_ON_DEMAND}`);
  assert.match(content, /\.hero-banner/);
});
