// Builds and stores v1/arrivals.json from PRT's GTFS-Realtime feed.
import { decodeArrivals } from './gtfs-realtime.js';

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
export const ARRIVALS_KEY = 'v1/arrivals.json';
const FETCH_TIMEOUT_MS = 20_000;
// Below one cron interval, so a cached copy is never more than about two minutes old.
const CACHE_SECONDS = 30;

async function fetchFeed() {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`PRT feed returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// If PRT fails or the feed can't be decoded, this throws without writing, so the last good file stays.
// Clients see its feedTime grow old and fall back to scheduled times.
export async function updateArrivals(bucket) {
  const { feedTime, routes } = decodeArrivals(await fetchFeed());
  if (!Object.keys(routes).length) throw new Error('Feed has no arrivals');
  const body = JSON.stringify({ version: 1, feedTime, routes });
  await bucket.put(ARRIVALS_KEY, body, {
    httpMetadata: { contentType: 'application/json', cacheControl: `public, max-age=${CACHE_SECONDS}` },
    customMetadata: { feedTime: String(feedTime) },
  });
  return { feedTime, routes: Object.keys(routes).length, bytes: body.length };
}
