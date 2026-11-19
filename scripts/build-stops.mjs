// Builds schedule data for each PRT bus route from PRT's static GTFS feed:
//   data/routes.json            each route's ID, name, and directions
//   data/routes/<route>.json    one route's stops, schedules, and service calendars
// It also copies P78's file to extension/stops.json, which the extension bundles.
// Usage: node scripts/build-stops.mjs path/to/unzipped/GTFS
import fs from 'node:fs';
import path from 'node:path';

// GTFS route_type for buses. Light rail and the inclines aren't in the bus live feed.
const BUS = '3';
const BUNDLED_ROUTE = 'P78';
// PRT's Developer License Agreement (¶7) requires this notice on everything made from its data.
// https://www.rideprt.org/policies/developer-license-agreement/
const NOTICE =
  'Reproduced with permission granted by Pittsburgh Regional Transit (PRT). The information has been provided by means of a nonexclusive, limited, and revocable license granted by PRT. PRT does not guarantee the accuracy, adequacy, completeness, or usefulness of any information. PRT provides this information "as is" without warranty of any kind, express or implied, including, but not limited to, warranties of merchantability or fitness for a particular purpose and assumes no responsibility for anyone\'s use of the information.';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dir = process.argv[2];
const root = path.join(import.meta.dirname, '..');

// Yields one object per row. PRT's files have no quoted fields, so splitting on commas is enough.
function* readCsv(file) {
  const [header, ...lines] = fs.readFileSync(path.join(dir, file), 'utf8').trim().split(/\r?\n/);
  const keys = header.split(',');
  for (const line of lines) {
    if (line.includes('"')) throw new Error(`${file} has a quoted field, which this script can't read: ${line}`);
    yield Object.fromEntries(line.split(',').map((v, i) => [keys[i], v]));
  }
}

function toSeconds(time) {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(data) + '\n');
}

const routes = [...readCsv('routes.txt')]
  .filter((r) => r.route_type === BUS)
  .sort((a, b) => a.route_id.localeCompare(b.route_id, 'en', { numeric: true }));
const routeIds = new Set(routes.map((r) => r.route_id));
const trips = [...readCsv('trips.txt')].filter((t) => routeIds.has(t.route_id));
const tripIds = new Set(trips.map((t) => t.trip_id));
const stopNames = new Map([...readCsv('stops.txt')].map((s) => [s.stop_id, s.stop_name]));
const calendar = [...readCsv('calendar.txt')];
const calendarDates = [...readCsv('calendar_dates.txt')];

// stop_times.txt is large, so keep only the fields this script uses.
const stopsByTrip = new Map();
for (const st of readCsv('stop_times.txt')) {
  if (!tripIds.has(st.trip_id)) continue;
  if (!stopsByTrip.has(st.trip_id)) stopsByTrip.set(st.trip_id, []);
  stopsByTrip.get(st.trip_id).push({ stop_id: st.stop_id, stop_sequence: Number(st.stop_sequence), arrival_time: st.arrival_time });
}

function buildRoute(trips) {
  const serviceIds = new Set(trips.map((t) => t.service_id));

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
  for (const c of calendar) {
    if (!serviceIds.has(c.service_id)) continue;
    services[c.service_id] = {
      days: DAYS.map((d) => c[d] === '1'),
      start: c.start_date,
      end: c.end_date,
      added: [],
      removed: [],
    };
  }
  for (const d of calendarDates) {
    if (!serviceIds.has(d.service_id)) continue;
    services[d.service_id] ??= { days: DAYS.map(() => false), start: d.date, end: d.date, added: [], removed: [] };
    services[d.service_id][d.exception_type === '1' ? 'added' : 'removed'].push(d.date);
  }

  // Directions are keyed by GTFS direction_id, so they come out in that order.
  return { services, directions: Object.values(directions) };
}

// Start clean, so a route that PRT drops doesn't leave a file behind.
fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'data/routes'), { recursive: true });

const index = [];
for (const route of routes) {
  const routeTrips = trips.filter((t) => t.route_id === route.route_id);
  if (!routeTrips.length) continue;
  const schedule = { notice: NOTICE, ...buildRoute(routeTrips) };
  writeJson(`data/routes/${route.route_id}.json`, schedule);
  index.push({ id: route.route_id, name: route.route_long_name, directions: schedule.directions.map((d) => d.name) });
}
writeJson('data/routes.json', { notice: NOTICE, routes: index });
fs.copyFileSync(path.join(root, `data/routes/${BUNDLED_ROUTE}.json`), path.join(root, 'extension/stops.json'));
console.log(`Wrote ${index.length} routes to data/ and ${BUNDLED_ROUTE} to extension/stops.json`);
