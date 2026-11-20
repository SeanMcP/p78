// Loads schedule data from GitHub Pages, where a GitHub Action rebuilds it from PRT's GTFS data each day,
// and keeps it in chrome.storage.local so the extension doesn't download it on every refresh.
const DATA_URL = 'https://seanmcp.github.io/p78/data/';
// The published data changes at most once a day, so a copy this recent is current enough.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TIMETABLE_PREFIX = 'timetable:';

// Returns the data at `path`, from a cached copy if it's recent, and otherwise downloaded. If the download
// fails or doesn't pass `isValid`, falls back to the cached copy however old it is, or null if there's none.
async function loadCached(path, key, isValid, { storage = chrome.storage.local, fetchFn = fetch, now = Date.now() } = {}) {
  const { [key]: cached } = await storage.get(key);
  if (cached && now - cached.fetchedAt < MAX_AGE_MS) return cached.data;

  try {
    const response = await fetchFn(`${DATA_URL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isValid(data)) throw new Error(`Unexpected data at ${path}`);
    await storage.set({ [key]: { data, fetchedAt: now } });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

// A route's timetable: { notice, services, directions }.
export function loadTimetable(routeId, options) {
  return loadCached(
    `routes/${encodeURIComponent(routeId)}.json`,
    `${TIMETABLE_PREFIX}${routeId}`,
    (data) => Array.isArray(data?.directions) && Boolean(data.services),
    options,
  );
}

// Every bus route: { notice, routes: [{ id, name, directions }] }.
export function loadRoutes(options) {
  return loadCached('routes.json', 'routes', (data) => Array.isArray(data?.routes), options);
}

// Removes cached timetables for routes not in `keepRouteIds`, such as routes looked at in the options page
// but never saved.
export async function pruneTimetables(keepRouteIds, { storage = chrome.storage.local } = {}) {
  const keep = new Set(keepRouteIds.map((id) => `${TIMETABLE_PREFIX}${id}`));
  const keys = Object.keys(await storage.get(null)).filter((key) => key.startsWith(TIMETABLE_PREFIX) && !keep.has(key));
  if (keys.length) await storage.remove(keys);
  return keys;
}
