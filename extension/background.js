import { arrivalStatus, fetchFeed, menuTitle, migrateStops, routeOf, shouldFetchLive, stopKey, trueTimeUrl } from './arrival.js';
import { LEVELS, animateIcon, paintIcon } from './icon.js';
import { loadTimetable } from './timetables.js';

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
const REFRESH_MINUTES = 1;
// The computer counts as idle after this long without input. Locked always counts.
const IDLE_SECONDS = 5 * 60;
// Reuse a feed fetched this recently, so changing a setting or ignoring a bus doesn't fetch again.
const FEED_REUSE_MS = 55 * 1000;
const PAUSE_MS = 60 * 60 * 1000;

let stopAnimation = () => {};
let lastStatus;
let lastMenu;
let lastFeed = { bytes: null, fetchedAt: 0 };

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Before saved stops, the extension saved one `stop` and a shared `nearMinutes`.
  const { stop, nearMinutes } = await chrome.storage.sync.get(['stop', 'nearMinutes']);
  if (stop) {
    await chrome.storage.sync.set({ stops: [{ ...stop, nearMinutes }] });
    await chrome.storage.sync.remove(['stop', 'nearMinutes']);
  }
  // Before every route, stops had no route; they were all on P78.
  const migrated = migrateStops(await chrome.storage.sync.get(['stops', 'activeStop']));
  if (migrated) await chrome.storage.sync.set(migrated);
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(update);
chrome.runtime.onInstalled.addListener(update);
chrome.alarms.onAlarm.addListener(update);
chrome.storage.onChanged.addListener(update);
chrome.idle.setDetectionInterval(IDLE_SECONDS);
// Refresh as soon as the computer is in use again, instead of waiting for the next alarm.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') update();
});
chrome.contextMenus.onClicked.addListener(async ({ menuItemId }) => {
  if (menuItemId.startsWith('stop:')) return chrome.storage.sync.set({ activeStop: menuItemId.slice('stop:'.length) });
  if (menuItemId === 'pause') return togglePause();

  const { tripId, ignored } = lastStatus ?? (await update());
  if (!tripId) return;
  const { ignoredTrips = [] } = await chrome.storage.session.get('ignoredTrips');
  const others = ignoredTrips.filter((id) => id !== tripId);
  // Trip IDs are only meaningful for a day, so keep just the most recent few.
  await chrome.storage.session.set({ ignoredTrips: ignored ? others : [...others, tripId].slice(-10) });
});
chrome.action.onClicked.addListener(async () => {
  const { stop } = await savedStops();
  if (stop) chrome.tabs.create({ url: trueTimeUrl(stop) });
  else chrome.runtime.openOptionsPage();
});
chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES });

// Returns the saved stops and the one the icon shows: the one picked in the menu, or else the first.
async function savedStops() {
  const { stops = [], activeStop } = await chrome.storage.sync.get(['stops', 'activeStop']);
  return { stops, stop: stops.find((s) => stopKey(s) === activeStop) ?? stops[0] };
}

// The pause is saved locally, so pausing on one computer doesn't pause the others.
async function pausedUntil() {
  const { pausedUntil = 0 } = await chrome.storage.local.get('pausedUntil');
  return pausedUntil > Date.now() ? pausedUntil : null;
}

async function togglePause() {
  if (await pausedUntil()) {
    chrome.alarms.clear('resume');
    return chrome.storage.local.remove('pausedUntil');
  }
  const until = Date.now() + PAUSE_MS;
  // Without this alarm, updates would resume only on the next refresh, up to a minute late.
  chrome.alarms.create('resume', { when: until });
  return chrome.storage.local.set({ pausedUntil: until });
}

async function update() {
  const [{ stops, stop }, { ignoredTrips }, idleState, paused] = await Promise.all([
    savedStops(),
    chrome.storage.session.get('ignoredTrips'),
    chrome.idle.queryState(IDLE_SECONDS),
    pausedUntil(),
  ]);
  const schedule = stop && !paused ? await loadTimetable(routeOf(stop)) : null;
  const liveChecked = !paused && shouldFetchLive({ idleState, timetable: schedule, stop });
  const feed = liveChecked ? await recentFeed() : null;
  const status = paused
    ? {
        label: '‖',
        level: LEVELS.scheduled,
        heading: 'P78',
        detail: `Paused until ${new Date(paused).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        paused: true,
      }
    : arrivalStatus({ feed, liveChecked, timetable: schedule, ignoredTrips, stop, nearMinutes: stop?.nearMinutes });
  const { label, level, heading, detail } = status;
  lastStatus = status;

  chrome.action.setTitle({ title: `${heading}\n${detail}` });
  updateMenu(stops, stop, status);
  stopAnimation();
  stopAnimation = animateIcon(level, (colors) => chrome.action.setIcon({ imageData: iconImages(label, colors) }));
  return status;
}

async function recentFeed() {
  if (lastFeed.bytes && Date.now() - lastFeed.fetchedAt < FEED_REUSE_MS) return lastFeed.bytes;
  const bytes = await fetchFeed(FEED_URL);
  lastFeed = { bytes, fetchedAt: Date.now() };
  return bytes;
}

// The icon's right-click menu: the saved stops to switch between, then "Ignore this bus" and "Pause updates".
function updateMenu(stops, activeStop, { tripId, ignored, paused }) {
  const items = [
    ...(stops.length > 1 ? stops : []).map((stop) => ({
      id: `stop:${stopKey(stop)}`,
      type: 'radio',
      checked: stop === activeStop,
      title: menuTitle(stop),
    })),
    { id: 'ignore', title: ignored ? 'Watch this bus' : 'Ignore this bus', enabled: Boolean(tripId) },
    { id: 'pause', title: paused ? 'Resume updates' : 'Pause updates for 1 hour' },
  ];
  // Rebuild only when something changed, so an open menu isn't redrawn on every refresh.
  const menu = JSON.stringify(items);
  if (menu === lastMenu) return;
  lastMenu = menu;
  chrome.contextMenus.removeAll(() => {
    for (const item of items) chrome.contextMenus.create({ ...item, contexts: ['action'] });
  });
}

function iconImages(label, colors) {
  const imageData = {};
  for (const size of [16, 32]) {
    const ctx = new OffscreenCanvas(size, size).getContext('2d');
    paintIcon(ctx, size, label, colors);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}
