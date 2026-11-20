import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { FEED_KEY, headerTimestamp } from '../src/feed.js';
import { feed } from '../../test/protobuf.js';

const FEED_TIME = 1_800_000_000;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeBucket() {
  const writes = [];
  return { writes, put: async (key, body, options) => writes.push({ key, body, options }) };
}

const controller = { scheduledTime: (FEED_TIME + 20) * 1000 };

// A feed big enough to pass the size check, like PRT's real one.
function bigFeed(timestamp = FEED_TIME) {
  const trips = Array.from({ length: 50 }, (_, i) => ({
    tripId: `trip-${i}`,
    routeId: 'P78',
    stops: [{ stopId: `stop-${i}`, arrival: FEED_TIME + i * 60 }],
  }));
  return feed(timestamp, trips);
}

test('copies the feed unchanged, with cache headers', async (t) => {
  t.mock.method(console, 'log', () => {});
  const bytes = bigFeed();
  globalThis.fetch = async () => new Response(bytes);
  const env = { ARRIVALS: fakeBucket() };

  await worker.scheduled(controller, env);

  const [write] = env.ARRIVALS.writes;
  assert.equal(write.key, FEED_KEY);
  assert.deepEqual(write.body, bytes);
  assert.equal(write.options.httpMetadata.contentType, 'application/x-protobuf');
  assert.match(write.options.httpMetadata.cacheControl, /max-age=30/);
  assert.equal(write.options.customMetadata.feedTime, String(FEED_TIME));
});

test('keeps the last good copy when PRT returns an error', async () => {
  globalThis.fetch = async () => new Response('Service Unavailable', { status: 503 });
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /HTTP 503/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good copy when PRT sends something that is not a feed', async () => {
  globalThis.fetch = async () => new Response(`<html>${'Maintenance '.repeat(200)}</html>`);
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /header/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good copy when the feed is nearly empty', async () => {
  globalThis.fetch = async () => new Response(feed(FEED_TIME, []));
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /only \d+ bytes/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('reads the header timestamp without decoding the rest', () => {
  assert.equal(headerTimestamp(bigFeed()), FEED_TIME);
  assert.throws(() => headerTimestamp(bigFeed(null)), /no header timestamp/);
});

test('the entry module has only a default export, since Workers treat named exports as entrypoints', async () => {
  assert.deepEqual(Object.keys(await import('../src/index.js')), ['default']);
});
