// Copies PRT's GTFS-Realtime feed to R2 as v1/trips.pb, unchanged. Clients decode it themselves:
// decoding all routes here takes 35-55 ms of CPU, and the Workers free plan allows 10 ms.

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
export const FEED_KEY = 'v1/trips.pb';
const FETCH_TIMEOUT_MS = 20_000;
// Below one cron interval, so a cached copy is never more than about two minutes old.
const CACHE_SECONDS = 30;
// The real feed is about 370 KB. Anything this small is an error page or an empty feed.
const MIN_BYTES = 1_000;

function readVarint(bytes, pos) {
  let value = 0;
  let multiplier = 1;
  let byte;
  do {
    if (pos >= bytes.length) throw new Error('Truncated varint');
    byte = bytes[pos++];
    value += (byte & 0x7f) * multiplier;
    multiplier *= 128;
  } while (byte & 0x80);
  return [value, pos];
}

// Reads FeedMessage.header.timestamp, which comes first in the message, without decoding the rest.
export function headerTimestamp(bytes) {
  let [tag, pos] = readVarint(bytes, 0);
  if (tag !== ((1 << 3) | 2)) throw new Error('Feed does not start with a header');
  let length;
  [length, pos] = readVarint(bytes, pos);
  const end = pos + length;
  if (end > bytes.length) throw new Error('Truncated header');
  while (pos < end) {
    [tag, pos] = readVarint(bytes, pos);
    const wireType = tag & 7;
    let value;
    if (wireType === 0) {
      [value, pos] = readVarint(bytes, pos);
      if (tag >>> 3 === 3) return value;
    } else if (wireType === 2) {
      [value, pos] = readVarint(bytes, pos);
      pos += value;
    } else {
      throw new Error(`Unexpected wire type ${wireType} in header`);
    }
  }
  throw new Error('Feed has no header timestamp');
}

async function fetchFeed() {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`PRT feed returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// If PRT fails or sends something that isn't a feed, this throws without writing, so the last good copy stays.
// Clients read the feed's own timestamp, see it grow old, and fall back to scheduled times.
export async function copyFeed(bucket) {
  const bytes = await fetchFeed();
  if (bytes.length < MIN_BYTES) throw new Error(`Feed is only ${bytes.length} bytes`);
  const feedTime = headerTimestamp(bytes);
  await bucket.put(FEED_KEY, bytes, {
    httpMetadata: { contentType: 'application/x-protobuf', cacheControl: `public, max-age=${CACHE_SECONDS}` },
    customMetadata: { feedTime: String(feedTime) },
  });
  return { feedTime, bytes: bytes.length };
}
