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

// The page used to watch a single `stop`.
const { stop: legacyStop } = await storage.get(['stop']);
if (legacyStop) {
  await storage.set({ stops: [legacyStop] });
  localStorage.removeItem('stop');
}

const faviconCanvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
const favicon = document.getElementById('favicon');
const arrivals = document.getElementById('arrivals');
const arrivalTemplate = document.getElementById('arrival');
let stopAnimations = [];
let latestUpdate = 0;

const timetable = await (await fetch('extension/stops.json')).json();
await initSettings(document.getElementById('settings'), storage, timetable, update, { multiple: true });
update();
setInterval(update, REFRESH_MS);

async function update() {
  const thisUpdate = ++latestUpdate;
  const [{ stops = [], nearMinutes }, feed] = await Promise.all([storage.get(['stops', 'nearMinutes']), FEED_URL ? fetchFeed(FEED_URL) : null]);
  // A newer update started while this one waited for the feed, so this one's settings may be out of date.
  if (thisUpdate !== latestUpdate) return;
  // With no stops, one card prompts the user to choose one.
  const cards = (stops.length ? stops : [undefined]).map((stop) => ({ stop, status: arrivalStatus({ feed, timetable, stop, nearMinutes }) }));

  stopAnimations.forEach((stopAnimation) => stopAnimation());
  arrivals.replaceChildren();
  // The tab follows the first stop.
  stopAnimations = cards.map(({ stop, status }, i) => {
    const card = arrivalTemplate.content.cloneNode(true);
    const iconCtx = card.querySelector('canvas').getContext('2d');
    card.querySelector('.title').textContent = status.heading;
    card.querySelector('.detail').textContent = status.detail;
    const trueTimeLink = card.querySelector('.truetime');
    trueTimeLink.hidden = !stop;
    if (stop) trueTimeLink.href = trueTimeUrl(stop);
    arrivals.append(card);

    return animateIcon(status.level, (colors) => {
      paintIcon(iconCtx, 256, status.label, colors);
      if (i > 0) return;
      paintIcon(faviconCanvas.getContext('2d'), 32, status.label, colors);
      favicon.href = faviconCanvas.toDataURL();
    });
  });
  document.title = stops.length ? `${cards[0].status.label} · P78` : 'P78';
}
