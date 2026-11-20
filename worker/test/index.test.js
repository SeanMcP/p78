import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { FEED_KEY, checkFeed } from '../src/feed.js';
import { feed, fixed32, fixed64, number, string } from '../../test/protobuf.js';

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

function bigFeed(timestamp = FEED_TIME, options) {
  const trips = Array.from({ length: 50 }, (_, i) => ({
    tripId: `trip-${i}`,
    routeId: 'P78',
    stops: [{ stopId: `stop-${i}`, arrival: FEED_TIME + i * 60 }],
  }));
  return feed(timestamp, trips, options);
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
  await assert.rejects(worker.scheduled(controller, env));
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good copy when the feed is cut off, even with a valid header', async () => {
  const bytes = bigFeed();
  globalThis.fetch = async () => new Response(bytes.subarray(0, Math.floor(bytes.length / 2)));
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /Truncated/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good copy when the feed has no entities', async () => {
  globalThis.fetch = async () => new Response(feed(FEED_TIME, []));
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /no entities/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('rejects a feed with no header timestamp', () => {
  assert.throws(() => checkFeed(bigFeed(null)), /no header timestamp/);
});

test('rejects a feed cut off at any byte inside an entity', () => {
  const bytes = bigFeed();
  for (let cut = bytes.length - 1; cut > bytes.length - 40; cut--) {
    assert.throws(() => checkFeed(bytes.subarray(0, cut)), /Truncated/, `cut at ${cut}`);
  }
});

test('accepts any header field order, fixed-width header extensions, and a header after the entities', () => {
  const header = [...fixed64(1001), ...number(3, FEED_TIME), ...fixed32(1000), ...string(1, '2.0')];
  assert.deepEqual(checkFeed(bigFeed(FEED_TIME, { header })), { feedTime: FEED_TIME, entities: 50 });
  assert.deepEqual(checkFeed(bigFeed(FEED_TIME, { headerLast: true })), { feedTime: FEED_TIME, entities: 50 });
});

test('the entry module has only a default export, since Workers treat named exports as entrypoints', async () => {
  assert.deepEqual(Object.keys(await import('../src/index.js')), ['default']);
});
