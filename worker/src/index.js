// Each minute, fetches PRT's GTFS-Realtime feed once for every user and copies it to R2.
// Clients read that copy through the Cloudflare cache and never call PRT or this worker.
// Only the default export belongs here: Workers treat named exports as entrypoints.
import { copyFeed } from './feed.js';

export default {
  async scheduled(controller, env) {
    const started = Date.now();
    const result = await copyFeed(env.ARRIVALS);
    console.log(JSON.stringify({
      message: 'Copied feed',
      ...result,
      feedAgeSeconds: Math.round(controller.scheduledTime / 1000) - result.feedTime,
      ms: Date.now() - started,
    }));
  },
};
