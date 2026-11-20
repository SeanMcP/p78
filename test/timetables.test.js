import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTimetable } from '../extension/timetables.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20, 12);
const timetable = (version) => ({ notice: 'notice', services: {}, directions: [{ name: 'INBOUND-DOWNTOWN', stops: [] }], version });

// A stand-in for chrome.storage.local.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, get: async (key) => (key in data ? { [key]: data[key] } : {}), set: async (items) => Object.assign(data, items) };
}

function fakeFetch(respond) {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return respond(url);
  };
  return { urls, fetchFn };
}

const ok = (body) => () => new Response(JSON.stringify(body));
const fail = () => {
  throw new TypeError('Failed to fetch');
};

test('downloads the route from GitHub Pages and caches it', async () => {
  const storage = fakeStorage();
  const { urls, fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'new');
  assert.deepEqual(urls, ['https://seanmcp.github.io/p78/data/routes/P78.json']);
  assert.deepEqual(storage.data['timetable:P78'], { timetable: timetable('new'), fetchedAt: NOW });
});

test('uses a cached copy under 12 hours old without downloading', async () => {
  const storage = fakeStorage({ 'timetable:P78': { timetable: timetable('cached'), fetchedAt: NOW - 11 * HOUR } });
  const { urls, fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'cached');
  assert.deepEqual(urls, []);
});

test('downloads again when the cached copy is 12 hours old', async () => {
  const storage = fakeStorage({ 'timetable:P78': { timetable: timetable('cached'), fetchedAt: NOW - 12 * HOUR } });
  const { fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'new');
  assert.equal(storage.data['timetable:P78'].fetchedAt, NOW);
});

test('falls back to an old cached copy when the download fails', async () => {
  const storage = fakeStorage({ 'timetable:P78': { timetable: timetable('cached'), fetchedAt: NOW - 72 * HOUR } });
  for (const respond of [fail, () => new Response('Not Found', { status: 404 }), ok({ not: 'a timetable' })]) {
    const { fetchFn } = fakeFetch(respond);
    assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'cached');
  }
  assert.equal(storage.data['timetable:P78'].fetchedAt, NOW - 72 * HOUR);
});

test('returns null when the download fails and nothing is cached', async () => {
  const { fetchFn } = fakeFetch(fail);
  assert.equal(await loadTimetable('P78', { storage: fakeStorage(), fetchFn, now: NOW }), null);
});

test('keeps each route in its own cache entry', async () => {
  const storage = fakeStorage();
  const { urls, fetchFn } = fakeFetch((url) => ok(timetable(url.split('/').pop()))());
  await loadTimetable('P78', { storage, fetchFn, now: NOW });
  await loadTimetable('71A', { storage, fetchFn, now: NOW });
  assert.deepEqual(Object.keys(storage.data).sort(), ['timetable:71A', 'timetable:P78']);
  assert.equal(urls.length, 2);
});
