import { registerBackgroundMessageHandler } from './messages';
import { registerBackgroundScheduler } from './scheduler';

const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.text();
};

registerBackgroundMessageHandler();

registerBackgroundScheduler({
  fetchHtml,
});
