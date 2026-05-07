const workspace = process.env.IAM_WORKSPACE_SLUG || 'inneranimalmedia';

module.exports = {
  testDir: './tests/quality',
  timeout: 60000,
  reporter: [
    ['line'],
    ['json', { outputFile: `captures/${workspace}/results.json` }],
    ['html', { outputFolder: `captures/${workspace}/raw-playwright-report`, open: 'never' }]
  ],
  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure'
  },
  outputDir: `captures/${workspace}/results`
};
