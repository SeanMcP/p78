// Loads a route's schedule from GitHub Pages, where a GitHub Action rebuilds it from PRT's GTFS data each day,
// and keeps it in chrome.storage.local so the extension doesn't download it on every refresh.
const DATA_URL = 'https://seanmcp.github.io/p78/data/routes/';
// The published data changes at most once a day, so a copy this recent is current enough.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const storageKey = (routeId) => `timetable:${routeId}`;

// Returns the route's timetable: { notice, services, directions }. Uses a cached copy if it's recent, and
// otherwise downloads a new one. If the download fails, falls back to the cached copy however old it is,
// and returns null only if there's none.
export async function loadTimetable(routeId, { storage = chrome.storage.local, fetchFn = fetch, now = Date.now() } = {}) {
  const key = storageKey(routeId);
  const { [key]: cached } = await storage.get(key);
  if (cached && now - cached.fetchedAt < MAX_AGE_MS) return cached.timetable;

  try {
    const response = await fetchFn(`${DATA_URL}${encodeURIComponent(routeId)}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const timetable = await response.json();
    if (!Array.isArray(timetable.directions) || !timetable.services) throw new Error('Not a timetable');
    await storage.set({ [key]: { timetable, fetchedAt: now } });
    return timetable;
  } catch {
    return cached?.timetable ?? null;
  }
}
