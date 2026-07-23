import assert from 'node:assert/strict';
import { matchLocalFolderToWorkspace } from '../../dashboard/src/lib/matchLocalFolderToWorkspace.ts';

const rows = [
  {
    id: 'ws_fuelnfreetime',
    name: 'fuelnfreetime',
    slug: 'fuelnfreetime',
    github_repo: 'SamPrimeaux/fuelnfreetime',
    root_path: '/Users/samprimeaux/fuelnfreetime',
  },
  {
    id: 'ws_meauxbility',
    name: 'Meauxbility Foundation',
    slug: 'meauxbility',
    github_repo: 'SamPrimeaux/meauxbility',
    root_path: '/Users/samprimeaux/meauxbility',
  },
  {
    id: 'ws_meauxbility_staging',
    name: 'Meauxbility CIDI Staging',
    slug: 'meauxbility-cidi-staging',
    github_repo: 'SamPrimeaux/meauxbility',
    root_path: null,
  },
  {
    id: 'ws_inneranimalmedia',
    name: 'inneranimalmedia',
    slug: 'inneranimalmedia',
    github_repo: 'SamPrimeaux/inneranimalmedia',
    root_path: '/Users/samprimeaux/inneranimalmedia',
  },
];

assert.equal(matchLocalFolderToWorkspace('fuelnfreetime', rows)?.id, 'ws_fuelnfreetime');
assert.equal(matchLocalFolderToWorkspace('inneranimalmedia', rows)?.id, 'ws_inneranimalmedia');
// shared github_repo: root_path wins for primary; staging alone would be ambiguous on repo name
assert.equal(matchLocalFolderToWorkspace('meauxbility', rows)?.id, 'ws_meauxbility');
assert.equal(matchLocalFolderToWorkspace('random-scratch', rows), null);
assert.equal(matchLocalFolderToWorkspace('', rows), null);

console.log('matchLocalFolderToWorkspace: ok');
