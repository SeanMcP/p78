import { arrivalStatus, displayName, fetchFeed, stopKey, trueTimeUrl } from './arrival.js';
import { animateIcon, paintIcon } from './icon.js';

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
const REFRESH_MINUTES = 0.5;

const timetable = fetch(chrome.runtime.getURL('stops.json')).then((response) => response.json());
let stopAnimation = () => {};
let lastStatus;
let lastMenu;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Before saved stops, the extension saved one `stop` and a shared `nearMinutes`.
  const { stop, nearMinutes } = await chrome.storage.sync.get(['stop', 'nearMinutes']);
  if (stop) {
    await chrome.storage.sync.set({ stops: [{ ...stop, nearMinutes }] });
    await chrome.storage.sync.remove(['stop', 'nearMinutes']);
  }
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(update);
chrome.runtime.onInstalled.addListener(update);
chrome.alarms.onAlarm.addListener(update);
chrome.storage.onChanged.addListener(update);
chrome.contextMenus.onClicked.addListener(async ({ menuItemId }) => {
  if (menuItemId.startsWith('stop:')) return chrome.storage.sync.set({ activeStop: menuItemId.slice('stop:'.length) });

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

async function update() {
  const [{ stops, stop }, { ignoredTrips }, feed] = await Promise.all([
    savedStops(),
    chrome.storage.session.get('ignoredTrips'),
    fetchFeed(FEED_URL),
  ]);
  const status = arrivalStatus({ feed, timetable: await timetable, ignoredTrips, stop, nearMinutes: stop?.nearMinutes });
  const { label, level, heading, detail } = status;
  lastStatus = status;

  chrome.action.setTitle({ title: `${heading}\n${detail}` });
  updateMenu(stops, stop, status);
  stopAnimation();
  stopAnimation = animateIcon(level, (colors) => chrome.action.setIcon({ imageData: iconImages(label, colors) }));
  return status;
}

// The icon's right-click menu: the saved stops to switch between, then "Ignore this bus".
function updateMenu(stops, activeStop, { tripId, ignored }) {
  const items = [
    ...(stops.length > 1 ? stops : []).map((stop) => ({
      id: `stop:${stopKey(stop)}`,
      type: 'radio',
      checked: stop === activeStop,
      title: stop.label ? stop.label : `${displayName(stop.name)} (${displayName(stop.direction.split('-')[0])})`,
    })),
    { id: 'ignore', title: ignored ? 'Watch this bus' : 'Ignore this bus', enabled: Boolean(tripId) },
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
