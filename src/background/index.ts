import { registerBackgroundScheduler } from './scheduler';

registerBackgroundScheduler({
  fetchHtml: async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }
    return response.text();
  },
});
