import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalsAt, feedTime } from '../extension/gtfs-realtime.js';
import { feed, fixed32, number, string } from './protobuf.js';

const FEED_TIME = 1_800_000_000;

test('lists a route\'s arrivals at a stop, soonest first', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 't2', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 600 }, { stopId: 'B', arrival: FEED_TIME + 900 }] },
    { tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 120 }] },
    { tripId: 't3', routeId: '71A', stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] },
  ]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A'), [
    { tripId: 't1', time: FEED_TIME + 120 },
    { tripId: 't2', time: FEED_TIME + 600 },
  ]);
});

test('uses the departure time when a stop has no arrival time', () => {
  const bytes = feed(FEED_TIME, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', departure: FEED_TIME + 30 }] }]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A'), [{ tripId: 't1', time: FEED_TIME + 30 }]);
});

test('leaves out canceled trips', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 'canceled', routeId: 'P78', relationship: 3, stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] },
    { tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 120 }] },
  ]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A'), [{ tripId: 't1', time: FEED_TIME + 120 }]);
});

test('leaves out deleted trips', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 'deleted', routeId: 'P78', relationship: 7, stops: [{ stopId: 'A', arrival: FEED_TIME + 60 }] },
    { tripId: 'scheduled', routeId: 'P78', relationship: 0, stops: [{ stopId: 'A', arrival: FEED_TIME + 120 }] },
    { tripId: 'added', routeId: 'P78', relationship: 8, stops: [{ stopId: 'A', arrival: FEED_TIME + 180 }] },
  ]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A').map(({ tripId }) => tripId), ['scheduled', 'added']);
});

test('lists each visit when a trip passes the same stop twice', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 'loop', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 300 }, { stopId: 'B', arrival: FEED_TIME + 1200 }, { stopId: 'A', arrival: FEED_TIME + 2400 }] },
  ]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A'), [
    { tripId: 'loop', time: FEED_TIME + 300 },
    { tripId: 'loop', time: FEED_TIME + 2400 },
  ]);
});

test('leaves out skipped stops and stops with no data', () => {
  const bytes = feed(FEED_TIME, [
    { tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 60, relationship: 1 }] },
    { tripId: 't2', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME + 120, relationship: 2 }] },
  ]);
  assert.deepEqual(arrivalsAt(bytes, 'P78', 'A'), []);
});

test('reads the feed time from the header', () => {
  assert.equal(feedTime(feed(FEED_TIME, [])), FEED_TIME);
  assert.equal(feedTime(feed(undefined, [])), undefined);
});

test('reads the feed time whatever the header field order, past fixed-width extensions', () => {
  const header = [...fixed32(1000), ...number(3, FEED_TIME), ...string(1, '2.0')];
  assert.equal(feedTime(feed(FEED_TIME, [], { header })), FEED_TIME);
});

test('rejects a feed cut off inside a fixed-width field', () => {
  const bytes = new Uint8Array([...feed(FEED_TIME, []), ...fixed32(1000)]);
  assert.doesNotThrow(() => arrivalsAt(bytes, 'P78', 'A'));
  assert.throws(() => arrivalsAt(bytes.subarray(0, bytes.length - 2), 'P78', 'A'), /Truncated/);
});

test('rejects a truncated feed', () => {
  const bytes = feed(FEED_TIME, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: FEED_TIME }] }]);
  assert.throws(() => arrivalsAt(bytes.subarray(0, bytes.length - 3), 'P78', 'A'), /Truncated/);
});
