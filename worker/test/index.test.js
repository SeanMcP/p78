import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { ARRIVALS_KEY } from '../src/arrivals.js';
import { feed } from './protobuf.js';

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

test('writes the arrivals file with cache headers', async (t) => {
  t.mock.method(console, 'log', () => {});
  const bytes = feed(FEED_TIME, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] }]);
  globalThis.fetch = async () => new Response(bytes);
  const env = { ARRIVALS: fakeBucket() };

  await worker.scheduled(controller, env);

  const [write] = env.ARRIVALS.writes;
  assert.equal(write.key, ARRIVALS_KEY);
  assert.deepEqual(JSON.parse(write.body), { version: 1, feedTime: FEED_TIME, routes: { P78: { A: [['t1', 60]] } } });
  assert.equal(write.options.httpMetadata.contentType, 'application/json');
  assert.match(write.options.httpMetadata.cacheControl, /max-age=30/);
});

test('keeps the last good file when PRT returns an error', async () => {
  globalThis.fetch = async () => new Response('Service Unavailable', { status: 503 });
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /HTTP 503/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good file when the feed cannot be decoded', async () => {
  globalThis.fetch = async () => new Response('<html>Maintenance</html>');
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env));
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('keeps the last good file when the feed has no trips', async () => {
  globalThis.fetch = async () => new Response(feed(FEED_TIME, []));
  const env = { ARRIVALS: fakeBucket() };
  await assert.rejects(worker.scheduled(controller, env), /no arrivals/);
  assert.equal(env.ARRIVALS.writes.length, 0);
});

test('the entry module has only a default export, since Workers treat named exports as entrypoints', async () => {
  assert.deepEqual(Object.keys(await import('../src/index.js')), ['default']);
});
