import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRoutes, loadTimetable, pruneTimetables } from '../extension/timetables.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20, 12);
const timetable = (version) => ({ notice: 'notice', services: {}, directions: [{ name: 'INBOUND-DOWNTOWN', stops: [] }], version });

// A stand-in for chrome.storage.local.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: async (key) => (key === null ? { ...data } : key in data ? { [key]: data[key] } : {}),
    set: async (items) => Object.assign(data, items),
    remove: async (keys) => keys.forEach((key) => delete data[key]),
  };
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
  assert.deepEqual(storage.data['timetable:P78'], { data: timetable('new'), fetchedAt: NOW });
});

test('uses a cached copy under 12 hours old without downloading', async () => {
  const storage = fakeStorage({ 'timetable:P78': { data: timetable('cached'), fetchedAt: NOW - 11 * HOUR } });
  const { urls, fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'cached');
  assert.deepEqual(urls, []);
});

test('downloads again when the cached copy is 12 hours old', async () => {
  const storage = fakeStorage({ 'timetable:P78': { data: timetable('cached'), fetchedAt: NOW - 12 * HOUR } });
  const { fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'new');
  assert.equal(storage.data['timetable:P78'].fetchedAt, NOW);
});

test('falls back to an old cached copy when the download fails', async () => {
  const storage = fakeStorage({ 'timetable:P78': { data: timetable('cached'), fetchedAt: NOW - 72 * HOUR } });
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

test('downloads the list of routes and caches it', async () => {
  const storage = fakeStorage();
  const index = { notice: 'notice', routes: [{ id: 'P78', name: 'OAKMONT FLYER', directions: [] }] };
  const { urls, fetchFn } = fakeFetch(ok(index));
  assert.deepEqual(await loadRoutes({ storage, fetchFn, now: NOW }), index);
  assert.deepEqual(urls, ['https://seanmcp.github.io/p78/data/routes.json']);
  assert.deepEqual(storage.data.routes, { data: index, fetchedAt: NOW });
});

test('encodes the route ID in the URL', async () => {
  const { urls, fetchFn } = fakeFetch(ok(timetable('new')));
  await loadTimetable('A/B', { storage: fakeStorage(), fetchFn, now: NOW });
  assert.deepEqual(urls, ['https://seanmcp.github.io/p78/data/routes/A%2FB.json']);
});

test('removes cached timetables for routes no saved stop uses, and nothing else', async () => {
  const entry = { data: timetable('x'), fetchedAt: NOW };
  const storage = fakeStorage({ 'timetable:P78': entry, 'timetable:71A': entry, 'timetable:28X': entry, routes: entry });
  assert.deepEqual(await pruneTimetables(['P78', '71A'], { storage }), ['timetable:28X']);
  assert.deepEqual(Object.keys(storage.data).sort(), ['routes', 'timetable:71A', 'timetable:P78']);
});

test('downloads again when a cached entry has no data', async () => {
  const storage = fakeStorage({ 'timetable:P78': { timetable: timetable('old format'), fetchedAt: NOW } });
  const { fetchFn } = fakeFetch(ok(timetable('new')));
  assert.equal((await loadTimetable('P78', { storage, fetchFn, now: NOW })).version, 'new');
});
