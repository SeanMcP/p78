import { arrivalStatus, fetchFeed, trueTimeUrl } from './extension/arrival.js';
import { animateIcon, paintIcon } from './extension/icon.js';
import { initSettings } from './extension/settings-form.js';

// PRT's feed doesn't allow cross-origin requests, so the page reads it through the worker in worker/.
// Leave empty to show scheduled times only.
const FEED_URL = 'https://p78-feed.sean-128.workers.dev';
const REFRESH_MS = 30_000;

const storage = {
  async get(keys) {
    return Object.fromEntries(keys.filter((key) => localStorage.getItem(key) !== null).map((key) => [key, JSON.parse(localStorage.getItem(key))]));
  },
  async set(items) {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value));
  },
};

const iconCtx = document.getElementById('icon').getContext('2d');
const faviconCanvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
const favicon = document.getElementById('favicon');
const heading = document.getElementById('heading');
const detail = document.getElementById('detail');
const trueTimeLink = document.getElementById('truetime');
let stopAnimation = () => {};

const timetable = await (await fetch('extension/stops.json')).json();
await initSettings(document.getElementById('settings'), storage, timetable, update);
update();
setInterval(update, REFRESH_MS);

async function update() {
  const [settings, feed] = await Promise.all([storage.get(['stop', 'nearMinutes']), FEED_URL ? fetchFeed(FEED_URL) : null]);
  const status = arrivalStatus({ feed, timetable, ...settings });

  heading.textContent = status.heading;
  detail.textContent = status.detail;
  trueTimeLink.hidden = !settings.stop;
  if (settings.stop) trueTimeLink.href = trueTimeUrl(settings.stop);
  document.title = settings.stop ? `${status.label} · P78` : 'P78';

  stopAnimation();
  stopAnimation = animateIcon(status.level, (colors) => {
    paintIcon(iconCtx, 256, status.label, colors);
    paintIcon(faviconCanvas.getContext('2d'), 32, status.label, colors);
    favicon.href = faviconCanvas.toDataURL();
  });
}
