// Builds extension/stops.json (stops, schedules, service calendars) from PRT's static GTFS feed.
// Usage: node scripts/build-stops.mjs path/to/unzipped/GTFS
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = 'P78';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dir = process.argv[2];

function readCsv(file) {
  const [header, ...lines] = fs.readFileSync(path.join(dir, file), 'utf8').trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i], v])));
}

function toSeconds(time) {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

const trips = readCsv('trips.txt').filter((t) => t.route_id === ROUTE);
const tripIds = new Set(trips.map((t) => t.trip_id));
const serviceIds = new Set(trips.map((t) => t.service_id));
const stopNames = new Map(readCsv('stops.txt').map((s) => [s.stop_id, s.stop_name]));

const stopsByTrip = new Map();
for (const st of readCsv('stop_times.txt')) {
  if (!tripIds.has(st.trip_id)) continue;
  if (!stopsByTrip.has(st.trip_id)) stopsByTrip.set(st.trip_id, []);
  stopsByTrip.get(st.trip_id).push(st);
}

// Use the longest trip in each direction as that direction's stop order.
const directions = {};
for (const trip of trips) {
  const stops = stopsByTrip.get(trip.trip_id).sort((a, b) => a.stop_sequence - b.stop_sequence);
  const current = directions[trip.direction_id];
  if (!current || stops.length > current.stops.length) {
    directions[trip.direction_id] = {
      name: trip.trip_headsign,
      stops: stops.map((s) => ({ id: s.stop_id, name: stopNames.get(s.stop_id), times: {} })),
    };
  }
}

// Scheduled arrivals per stop, in seconds after the start of the service day, grouped by service.
for (const trip of trips) {
  const direction = directions[trip.direction_id];
  for (const st of stopsByTrip.get(trip.trip_id)) {
    const stop = direction.stops.find((s) => s.id === st.stop_id);
    if (!stop) continue;
    (stop.times[trip.service_id] ??= []).push(toSeconds(st.arrival_time));
  }
}
for (const direction of Object.values(directions)) {
  for (const stop of direction.stops) Object.values(stop.times).forEach((t) => t.sort((a, b) => a - b));
}

const services = {};
for (const c of readCsv('calendar.txt')) {
  if (!serviceIds.has(c.service_id)) continue;
  services[c.service_id] = {
    days: DAYS.map((d) => c[d] === '1'),
    start: c.start_date,
    end: c.end_date,
    added: [],
    removed: [],
  };
}
for (const d of readCsv('calendar_dates.txt')) {
  if (!serviceIds.has(d.service_id)) continue;
  services[d.service_id] ??= { days: DAYS.map(() => false), start: d.date, end: d.date, added: [], removed: [] };
  services[d.service_id][d.exception_type === '1' ? 'added' : 'removed'].push(d.date);
}

const out = path.join(import.meta.dirname, '../extension/stops.json');
fs.writeFileSync(out, JSON.stringify({ services, directions: Object.values(directions) }) + '\n');
console.log(`Wrote ${out}`);
