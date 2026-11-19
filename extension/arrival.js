// Turns live and scheduled data into what the icon shows. Shared by the extension and the web page.
import { arrivalsAt } from './gtfs-realtime.js';
import { nextScheduled } from './schedule.js';
import { DEFAULT_NEAR_MINUTES, LEVELS } from './icon.js';

const ROUTE = 'P78';

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

// `ignoredTrips` are trip IDs to show muted instead of live. The result's `tripId` is the live bus shown, if any.
export function arrivalStatus({ feed, timetable, stop, nearMinutes = DEFAULT_NEAR_MINUTES, ignoredTrips = [], now = Date.now() / 1000 }) {
  if (!stop) return { label: '?', level: LEVELS.none, heading: 'P78', detail: 'Choose a stop' };
  const heading = `P78 at ${displayName(stop.name)}`;

  const live = feed ? arrivalsAt(feed, ROUTE, stop.id).filter(({ time }) => time >= now - 30) : [];
  if (live.length) {
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

  const scheduledStop = timetable.directions.find((d) => d.name === stop.direction)?.stops.find((s) => s.id === stop.id);
  const time = scheduledStop && nextScheduled(timetable, scheduledStop, now);
  if (!time) return { label: '–', level: LEVELS.none, heading, detail: 'No buses scheduled' };

  const minutes = Math.round((time - now) / 60);
  const clock = new Date(time * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return {
    label: minutes < 60 ? String(minutes) : `${Math.floor(minutes / 60)}h`,
    level: LEVELS.scheduled,
    heading,
    detail: `Next scheduled: ${clock} (${feed ? 'not tracked live yet' : 'live data unavailable'})`,
  };
}

export function trueTimeUrl(stop) {
  const feed = 'Port Authority Bus:';
  const params = new URLSearchParams({
    route: feed + ROUTE,
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
