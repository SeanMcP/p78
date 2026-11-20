import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeArrivals } from '../src/gtfs-realtime.js';
import { feed } from './protobuf.js';

const FEED_TIME = 1_800_000_000;

test('groups arrivals by route and stop, soonest first, as seconds after the feed time', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 't2', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 600 }, { stopId: 'B', arrival: FEED_TIME + 900 }] },
    { tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 120 }] },
    { tripId: 't3', routeId: '71A', stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] },
  ]);
  assert.deepEqual(decodeArrivals(bytes), {
    feedTime: FEED_TIME,
    routes: {
      P78: { A: [['t1', 120], ['t2', 600]], B: [['t2', 900]] },
      '71A': { A: [['t3', 60]] },
    },
  });
});

test('uses the departure time when a stop has no arrival time', () => {
  const bytes = feed(FEED_TIME, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', departure: FEED_TIME + 30 }] }]);
  assert.deepEqual(decodeArrivals(bytes).routes, { P78: { A: [['t1', 30]] } });
});

test('drops canceled trips, skipped stops, and stops with no data', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 'canceled', routeId: 'P78', relationship: 3, stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] },
    {
      tripId: 't1',
      routeId: 'P78',
      stops: [
        { stopId: 'A', arrival: FEED_TIME + 60, relationship: 1 },
        { stopId: 'B', arrival: FEED_TIME + 120, relationship: 2 },
        { stopId: 'C', arrival: FEED_TIME + 180 },
      ],
    },
  ]);
  assert.deepEqual(decodeArrivals(bytes).routes, { P78: { C: [['t1', 180]] } });
});

test('drops arrivals more than a minute before the feed time', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME - 61 }, { stopId: 'B', arrival: FEED_TIME - 60 }] },
  ]);
  assert.deepEqual(decodeArrivals(bytes).routes, { P78: { B: [['t1', -60]] } });
});

test('rejects a feed with no header timestamp', () => {
  assert.throws(() => decodeArrivals(feed(undefined, [])), /no header timestamp/);
});

test('rejects a truncated feed', () => {
  const bytes = feed(FEED_TIME, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME }] }]);
  assert.throws(() => decodeArrivals(bytes.subarray(0, bytes.length - 3)), /Truncated/);
});
