import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalStatus } from '../extension/arrival.js';
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
