import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalStatus, menuTitle, migrateStops, routeOf, shouldFetchLive, stopKey, trueTimeUrl } from '../extension/arrival.js';
import { feed } from './protobuf.js';

// Noon local time, with one P78 bus scheduled at stop A every day at 12:30.
const noon = new Date();
noon.setHours(12, 0, 0, 0);
const NOW = noon.getTime() / 1000;
const timetable = {
  services: { daily: { days: [1, 1, 1, 1, 1, 1, 1], start: '20000101', end: '29991231', added: [], removed: [] } },
  directions: [{ name: 'INBOUND-DOWNTOWN', stops: [{ id: 'A', name: 'STOP A', times: { daily: [12.5 * 3600] } }] }],
};
const stop = { id: 'A', name: 'STOP A', direction: 'INBOUND-DOWNTOWN' };

test('shows a live bus from the feed', () => {
  const bytes = feed(NOW, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: NOW + 300 }] }]);
  const status = arrivalStatus({ feed: bytes, timetable, stop, now: NOW });
  assert.equal(status.label, '5');
  assert.equal(status.tripId, 't1');
});

test('falls back to the schedule when the feed cannot be decoded', () => {
  const bytes = feed(NOW, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: NOW + 300 }] }]);
  const status = arrivalStatus({ feed: bytes.subarray(0, bytes.length - 3), timetable, stop, now: NOW });
  assert.equal(status.label, '30');
  assert.match(status.detail, /live data unavailable/);
});

test('says the bus is not tracked yet when the feed decodes but has no bus for the stop', () => {
  const status = arrivalStatus({ feed: feed(NOW, [{ tripId: 't9', routeId: '71A', stops: [{ stopId: 'A', arrival: NOW + 60 }] }]), timetable, stop, now: NOW });
  assert.equal(status.label, '30');
  assert.match(status.detail, /not tracked live yet/);
});

test('says only the scheduled time when live data was not checked', () => {
  const status = arrivalStatus({ feed: null, liveChecked: false, timetable, stop, now: NOW });
  assert.equal(status.label, '30');
  assert.doesNotMatch(status.detail, /live|tracked/);
});

const at = (hours, minutes) => NOW + ((hours - 12) * 60 + minutes) * 60;

test('fetches live data when a bus is due within 30 minutes', () => {
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(12, 0) }), true);
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(12, 29) }), true);
});

test('does not fetch live data when the next bus is more than 30 minutes away', () => {
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(11, 59) }), false);
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(6, 0) }), false);
});

test('keeps fetching for 15 minutes after the scheduled time, for a late bus', () => {
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(12, 44) }), true);
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop, now: at(12, 46) }), false);
});

test('does not fetch live data while the computer is idle or locked', () => {
  assert.equal(shouldFetchLive({ idleState: 'idle', timetable, stop, now: at(12, 20) }), false);
  assert.equal(shouldFetchLive({ idleState: 'locked', timetable, stop, now: at(12, 20) }), false);
});

test('fetches live data for a stop missing from the timetable, and not without a stop', () => {
  const unknown = { id: 'Z', name: 'STOP Z', direction: 'INBOUND-DOWNTOWN' };
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop: unknown, now: at(6, 0) }), true);
  assert.equal(shouldFetchLive({ idleState: 'active', timetable, stop: undefined, now: at(12, 20) }), false);
});

test('without a schedule, still shows live buses, and says the schedule is unavailable otherwise', () => {
  const bytes = feed(NOW, [{ tripId: 't1', routeId: 'P78', stops: [{ stopId: 'A', arrival: NOW + 300 }] }]);
  assert.equal(arrivalStatus({ feed: bytes, timetable: null, stop, now: NOW }).label, '5');
  const status = arrivalStatus({ feed: null, timetable: null, stop, now: NOW });
  assert.equal(status.label, '–');
  assert.match(status.detail, /Schedule unavailable/);
});

test('fetches live data when the schedule could not be loaded', () => {
  assert.equal(shouldFetchLive({ idleState: 'active', timetable: null, stop, now: at(6, 0) }), true);
  assert.equal(shouldFetchLive({ idleState: 'idle', timetable: null, stop, now: at(6, 0) }), false);
});

test('a stop with no route is on P78', () => {
  assert.equal(routeOf(stop), 'P78');
  assert.equal(routeOf({ ...stop, route: '71A' }), '71A');
});

test('shows live buses for the stop\'s own route only', () => {
  const bytes = feed(NOW, [
    { tripId: 'p78', routeId: 'P78', stops: [{ stopId: 'A', arrival: NOW + 120 }] },
    { tripId: '71a', routeId: '71A', stops: [{ stopId: 'A', arrival: NOW + 600 }] },
  ]);
  const status = arrivalStatus({ feed: bytes, timetable, stop: { ...stop, route: '71A' }, now: NOW });
  assert.equal(status.tripId, '71a');
  assert.equal(status.label, '10');
  assert.equal(status.heading, '71A at Stop A');
});

test('identifies a saved stop by route, direction, and stop', () => {
  assert.equal(stopKey(stop), 'P78:INBOUND-DOWNTOWN:A');
  assert.notEqual(stopKey({ ...stop, route: '71A' }), stopKey({ ...stop, route: '71B' }));
});

test('links to the stop on TrueTime for its route', () => {
  const url = new URL(trueTimeUrl({ ...stop, route: '71A' }));
  assert.equal(url.searchParams.get('route'), 'Port Authority Bus:71A');
  assert.equal(url.searchParams.get('id'), 'Port Authority Bus:A');
});

test('puts the route first in the menu', () => {
  assert.equal(menuTitle({ ...stop, route: '71A', label: 'Home' }), '71A Home');
  assert.equal(menuTitle(stop), 'P78 Stop A (Inbound)');
});

test('gives stops saved before routes the route P78, and updates the active stop', () => {
  const old = { id: 'A', name: 'STOP A', direction: 'INBOUND-DOWNTOWN', nearMinutes: 5 };
  const other = { id: 'B', name: 'STOP B', direction: 'OUTBOUND-HARMAR' };
  assert.deepEqual(migrateStops({ stops: [old, other], activeStop: 'OUTBOUND-HARMAR:B' }), {
    stops: [{ ...old, route: 'P78' }, { ...other, route: 'P78' }],
    activeStop: 'P78:OUTBOUND-HARMAR:B',
  });
  assert.deepEqual(migrateStops({ stops: [old] }), { stops: [{ ...old, route: 'P78' }] });
});

test('leaves stops that already have routes alone', () => {
  assert.equal(migrateStops({ stops: [{ ...stop, route: '71A' }], activeStop: 'x' }), null);
  assert.equal(migrateStops({}), null);
});
