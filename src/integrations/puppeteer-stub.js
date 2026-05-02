const puppeteer = {
  launch: async () => {
    throw new Error('Puppeteer not available in this environment');
  }
};
export default puppeteer;
