// Copies PRT's GTFS-Realtime feed to R2 as v1/trips.pb, unchanged. Clients decode it themselves:
// decoding all routes here took 34-56 ms of CPU, and the Workers free plan allows 10 ms.

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
export const FEED_KEY = 'v1/trips.pb';
// From Cloudflare, about a quarter of connections to PRT's server time out (HTTP 522 after about 19 s), so
// each run tries twice with a shorter timeout. The worst case, about 22 s, fits well inside the minute.
const ATTEMPTS = 2;
const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
// Below one cron interval, so a cached copy is never more than about two minutes old.
const CACHE_SECONDS = 30;

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

// Calls `onField(field, wireType, value, start, end)` for each field in bytes[start, end), where `value` is
// the varint for wire type 0 and the payload length for wire type 2. Throws if a field runs past `end`.
function walkFields(bytes, start, end, onField) {
  let pos = start;
  while (pos < end) {
    let tag;
    [tag, pos] = readVarint(bytes, pos);
    const wireType = tag & 7;
    let value;
    let fieldStart = pos;
    if (wireType === 0) {
      [value, pos] = readVarint(bytes, pos);
    } else if (wireType === 2) {
      [value, fieldStart] = readVarint(bytes, pos);
      pos = fieldStart + value;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
    if (pos > end) throw new Error('Truncated feed');
    onField(tag >>> 3, wireType, value, fieldStart, pos);
  }
}

// Checks the feed's top-level structure without decoding the entities, and returns the header timestamp.
// This catches a feed that was cut off partway through an entity, since that entity's length then runs
// past the end. A feed cut exactly between two entities can't be detected: protobuf has no end marker.
export function checkFeed(bytes) {
  let feedTime;
  let entities = 0;
  walkFields(bytes, 0, bytes.length, (field, wireType, value, start, end) => {
    if (field === 1 && wireType === 2) {
      walkFields(bytes, start, end, (headerField, headerWireType, headerValue) => {
        if (headerField === 3 && headerWireType === 0) feedTime = headerValue;
      });
    } else if (field === 2 && wireType === 2) {
      entities++;
    }
  });
  if (!feedTime) throw new Error('Feed has no header timestamp');
  if (!entities) throw new Error('Feed has no entities');
  return { feedTime, entities };
}

async function fetchFeed() {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`PRT feed returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// Fetches and checks the feed, trying again once if PRT fails or sends something that isn't a whole feed.
async function fetchCheckedFeed({ attempts = ATTEMPTS, retryDelayMs = RETRY_DELAY_MS } = {}) {
  const errors = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const bytes = await fetchFeed();
      return { bytes, attempt, retriedAfter: errors, ...checkFeed(bytes) };
    } catch (error) {
      errors.push(error.message);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`PRT feed failed ${attempts} times: ${errors.join('; ')}`);
}

// If every attempt fails, this throws without writing, so the last good copy stays. Clients read the
// feed's own timestamp, see it grow old, and fall back to scheduled times.
export async function copyFeed(bucket, options) {
  const { bytes, feedTime, entities, attempt, retriedAfter } = await fetchCheckedFeed(options);
  await bucket.put(FEED_KEY, bytes, {
    httpMetadata: { contentType: 'application/x-protobuf', cacheControl: `public, max-age=${CACHE_SECONDS}` },
    customMetadata: { feedTime: String(feedTime) },
  });
  return { feedTime, entities, bytes: bytes.length, attempt, ...(retriedAfter.length && { retriedAfter }) };
}
