import { arrivalStatus, fetchFeed, trueTimeUrl } from './arrival.js';
import { animateIcon, paintIcon } from './icon.js';

const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
const REFRESH_MINUTES = 0.5;

const timetable = fetch(chrome.runtime.getURL('stops.json')).then((response) => response.json());
let stopAnimation = () => {};
let lastStatus;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
  chrome.contextMenus.create({ id: 'ignore', title: 'Ignore this bus', contexts: ['action'], enabled: false });
});
chrome.runtime.onStartup.addListener(update);
chrome.runtime.onInstalled.addListener(update);
chrome.alarms.onAlarm.addListener(update);
chrome.storage.onChanged.addListener(update);
chrome.contextMenus.onClicked.addListener(async () => {
  const { tripId, ignored } = lastStatus ?? (await update());
  if (!tripId) return;
  const { ignoredTrips = [] } = await chrome.storage.session.get('ignoredTrips');
  const others = ignoredTrips.filter((id) => id !== tripId);
  // Trip IDs are only meaningful for a day, so keep just the most recent few.
  await chrome.storage.session.set({ ignoredTrips: ignored ? others : [...others, tripId].slice(-10) });
});
chrome.action.onClicked.addListener(async () => {
  const { stop } = await chrome.storage.sync.get('stop');
  if (stop) chrome.tabs.create({ url: trueTimeUrl(stop) });
  else chrome.runtime.openOptionsPage();
});
chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES });

async function update() {
  const [settings, { ignoredTrips }, feed] = await Promise.all([
    chrome.storage.sync.get(['stop', 'nearMinutes']),
    chrome.storage.session.get('ignoredTrips'),
    fetchFeed(FEED_URL),
  ]);
  const status = arrivalStatus({ feed, timetable: await timetable, ignoredTrips, ...settings });
  const { label, level, heading, detail, tripId, ignored } = status;
  lastStatus = status;

  chrome.action.setTitle({ title: `${heading}\n${detail}` });
  chrome.contextMenus.update('ignore', { enabled: Boolean(tripId), title: ignored ? 'Watch this bus' : 'Ignore this bus' });
  stopAnimation();
  stopAnimation = animateIcon(level, (colors) => chrome.action.setIcon({ imageData: iconImages(label, colors) }));
  return status;
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
