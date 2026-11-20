// Each minute, fetches PRT's GTFS-Realtime feed once for every user and writes the arrivals to R2.
// Clients read that file through the Cloudflare cache and never call PRT or this worker.
// Only the default export belongs here: Workers treat named exports as entrypoints.
import { updateArrivals } from './arrivals.js';

export default {
  async scheduled(controller, env) {
    const started = Date.now();
    const result = await updateArrivals(env.ARRIVALS);
    console.log(JSON.stringify({
      message: 'Wrote arrivals',
      ...result,
      feedAgeSeconds: Math.round(controller.scheduledTime / 1000) - result.feedTime,
      ms: Date.now() - started,
    }));
  },
};
