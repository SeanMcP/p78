// Turns live and scheduled data into what the icon shows.
import { arrivalsAt } from './gtfs-realtime.js';
import { nextScheduled } from './schedule.js';
import { DEFAULT_NEAR_MINUTES, LEVELS } from './icon.js';

// Stops saved before the extension supported every route were all on P78, and have no `route`.
export const DEFAULT_ROUTE = 'P78';
// With "Ignore this bus" and "Pause updates", this fills the six items Chrome allows in the icon's right-click menu.
export const MAX_STOPS = 4;
// Live data is fetched only when a bus is scheduled from LATE_MINUTES ago to AHEAD_MINUTES from now.
// Looking back keeps a late bus tracked after its scheduled time passes.
const AHEAD_MINUTES = 30;
const LATE_MINUTES = 15;

// Returns the feed's bytes, or null if it couldn't be fetched.
export async function fetchFeed(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

// `timetable` is null when the schedule couldn't be loaded.
function timetableStop(timetable, stop) {
  return timetable?.directions.find((d) => d.name === stop.direction)?.stops.find((s) => s.id === stop.id);
}

// Whether to fetch PRT's feed now. Each fetch downloads the whole feed (about 390 KB) from PRT, so the
// extension fetches only while the computer is in use and a bus is due soon. `idleState` comes from
// chrome.idle: 'active', 'idle', or 'locked'.
export function shouldFetchLive({ idleState, timetable, stop, now = Date.now() / 1000 }) {
  if (idleState !== 'active' || !stop) return false;
  const scheduledStop = timetableStop(timetable, stop);
  // A stop missing from the timetable can't be checked against the schedule, so live data is all there is.
  if (!scheduledStop) return true;
  const next = nextScheduled(timetable, scheduledStop, now - LATE_MINUTES * 60);
  return Boolean(next) && next <= now + AHEAD_MINUTES * 60;
}

// `ignoredTrips` are trip IDs to show muted instead of live. The result's `tripId` is the live bus shown, if any.
// `liveChecked` is false when the feed wasn't fetched because no bus is due soon or the computer is idle.
export function arrivalStatus({ feed, liveChecked = true, timetable, stop, nearMinutes = DEFAULT_NEAR_MINUTES, ignoredTrips = [], now = Date.now() / 1000 }) {
  if (!stop) return { label: '?', level: LEVELS.none, heading: 'P78', detail: 'Choose a stop' };
  const heading = `${routeOf(stop)} at ${displayName(stop.name)}`;

  const live = liveArrivals(feed, stop, now);
  if (live?.length) {
    const minutesUntil = ({ time }) => Math.max(0, Math.round((time - now) / 60));
    const [next] = live;
    const nextMinutes = minutesUntil(next);
    const ignored = ignoredTrips.includes(next.tripId);
    return {
      label: nextMinutes > 99 ? '99+' : String(nextMinutes),
      level: ignored ? LEVELS.scheduled : nextMinutes <= nearMinutes ? LEVELS.near : LEVELS.far,
      heading,
      detail: live.map((bus) => `${minutesUntil(bus)} min${ignoredTrips.includes(bus.tripId) ? ' (ignored)' : ''}`).join(', '),
      tripId: next.tripId,
      ignored,
    };
  }

  if (!timetable) return { label: '–', level: LEVELS.none, heading, detail: `Schedule unavailable${live ? '' : '; live data unavailable'}` };
  const scheduledStop = timetableStop(timetable, stop);
  const time = scheduledStop && nextScheduled(timetable, scheduledStop, now);
  if (!time) return { label: '–', level: LEVELS.none, heading, detail: 'No buses scheduled' };

  const minutes = Math.round((time - now) / 60);
  const clock = new Date(time * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return {
    label: minutes < 60 ? String(minutes) : `${Math.floor(minutes / 60)}h`,
    level: LEVELS.scheduled,
    heading,
    detail: `Next scheduled: ${clock}${liveChecked ? ` (${live ? 'not tracked live yet' : 'live data unavailable'})` : ''}`,
  };
}

// Live arrivals at a stop, or null if there's no feed or it can't be decoded, so the icon falls back to the
// schedule instead of failing.
function liveArrivals(feed, stop, now) {
  if (!feed) return null;
  try {
    return arrivalsAt(feed, routeOf(stop), stop.id).filter(({ time }) => time >= now - 30);
  } catch {
    return null;
  }
}

export function trueTimeUrl(stop) {
  const feed = 'Port Authority Bus:';
  const params = new URLSearchParams({
    route: feed + routeOf(stop),
    direction: feed + stop.direction.split('-')[0],
    id: feed + stop.id,
    showAllBusses: 'on',
  });
  return `https://truetime.rideprt.org/bustime/wireless/html/eta.jsp?${params}`;
}

// PRT stop names are all caps ("LAKETON RD + #1746"); soften them for display.
export function displayName(stopName) {
  return stopName
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Ns|Fs)\b/g, (s) => s.toUpperCase());
}

export function routeOf(stop) {
  return stop.route ?? DEFAULT_ROUTE;
}

// Identifies a saved stop. The same stop ID can be saved in both directions, and on more than one route.
export function stopKey(stop) {
  return `${routeOf(stop)}:${stop.direction}:${stop.id}`;
}

// Gives stops saved before routes existed the route P78, and updates `activeStop`, which used to be a key
// without the route. Returns null if nothing needs to change.
export function migrateStops({ stops = [], activeStop }) {
  if (stops.every((stop) => stop.route)) return null;
  const migrated = stops.map((stop) => (stop.route ? stop : { ...stop, route: DEFAULT_ROUTE }));
  const legacy = stops.find((stop) => !stop.route && `${stop.direction}:${stop.id}` === activeStop);
  if (legacy) return { stops: migrated, activeStop: stopKey({ ...legacy, route: DEFAULT_ROUTE }) };
  return { stops: migrated };
}

// The route and stop, for the right-click menu: "71A Home" or "71A Negley Av + Bryant St (Inbound)".
export function menuTitle(stop) {
  return `${routeOf(stop)} ${stop.label ? stop.label : `${displayName(stop.name)} (${displayName(stop.direction.split('-')[0])})`}`;
}

export function stopLabel(stop) {
  return stop.label || displayName(stop.name);
}

export function directionName(name) {
  const [heading, destination] = name.split('-');
  return `${displayName(heading)} to ${displayName(destination)}`;
}
