  {
    id: 'G-ask-repo',
    kind: 'chat',
    // Uses agentsam_github_tree (fast, no rate limit) to prove the github handler resolves
    // correctly for the operator user. agentsam_github_search is rate-limited (~10/min) and
    // slower; it has its own dedicated test when needed. Tree + read is the reliable baseline.
    prompt:
      'List the top-level files and folders in the SamPrimeaux/inneranimalmedia repo using agentsam_github_tree. Reply with just the list.',
    mode: 'agent',
    assert: (ctx) => {
      const fails = assertInspectishChat({
        maxToolsFromDecisionMeta: 20,
        requireMinTools: 1,
        maxDistinctTools: 20,
        banSubstrings: [
          'x-google-enum-descriptions',
          'terminal tool requires command',
          'Gemini 400',
        ],
        banToolPrefixes: ['gmail_', 'agentsam_gmail'],
      })(ctx);
      const tt = String(ctx.decision?.task_type || '');
      if (!['search_code', 'ask', 'review', 'github'].includes(tt)) {
        fails.push(`G-ask-repo expected search_code|ask|review|github, got ${tt || '?'}`);
      }
      if (tt === 'tool_use' || tt === 'browser') {
        fails.push(`G-ask-repo must not drift to ${tt}`);
      }
      // Any github-handler tool counts — tree, read, search, repo_list are all valid proof.
      fails.push(...assertRequiredToolCall(ctx, /agentsam_github|github_tree|github_read|github_search|github_repo/i, 'G-ask-repo'));
      if (ctx.aborted && mergedToolNames(ctx).length === 0) {
        fails.push(`G-ask-repo aborted after ${CHAT_TIMEOUT_MS}ms with no tool proof`);
      }
      return fails;
    },
  },