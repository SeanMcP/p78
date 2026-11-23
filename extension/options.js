// The options dialog. Save adds a stop, with its route, its own name, and flash time, to `stops` in
// chrome.storage.sync.
import { DEFAULT_ROUTE, MAX_STOPS, directionName, displayName, routeOf, stopKey, stopLabel } from './arrival.js';
import { DEFAULT_NEAR_MINUTES, LEVELS, paintIcon } from './icon.js';
import { loadRoutes, loadTimetable, pruneTimetables } from './timetables.js';

const routeSelect = document.querySelector('#route');
const directionGroup = document.querySelector('#direction');
const stopSelect = document.querySelector('#stop');
const nameInput = document.querySelector('#name');
const nearInput = document.querySelector('#near');
const saveButton = document.querySelector('#save');
const status = document.querySelector('#status');
const legend = document.querySelector('#legend');
const watching = document.querySelector('#watching');
const count = document.querySelector('#count');
const empty = document.querySelector('#empty');

let { stops = [] } = await chrome.storage.sync.get('stops');
// Schedules looked at here are cached; drop the ones for routes no saved stop uses.
pruneTimetables(stops.map(routeOf));

const routeIndex = await loadRoutes();
const routes = routeIndex?.routes ?? [];
document.querySelector('#notice').textContent = routeIndex?.notice ?? '';
// The route's timetable, and a counter so a slow download can't replace a newer choice.
let timetable = null;
let loading = 0;

routeSelect.replaceChildren(...routes.map((r) => new Option(`${r.id} ${displayName(r.name)}`, r.id)));
routeSelect.addEventListener('change', () => showRoute(routeSelect.value));
renderWatching();
renderLegend(DEFAULT_NEAR_MINUTES);
nearInput.value = DEFAULT_NEAR_MINUTES;

nearInput.addEventListener('change', () => {
  const minutes = nearMinutesInput();
  if (!minutes) return (nearInput.value = DEFAULT_NEAR_MINUTES);
  renderLegend(minutes);
});

saveButton.addEventListener('click', async () => {
  if (!stopSelect.value) return (status.textContent = 'Choose a stop first.');
  const stop = { ...selectedStop(), nearMinutes: nearMinutesInput() ?? DEFAULT_NEAR_MINUTES };
  const label = nameInput.value.trim();
  if (label) stop.label = label;
  // Saving a stop again replaces it in place, so that doesn't count toward the limit.
  const existing = stops.findIndex((s) => stopKey(s) === stopKey(stop));
  if (existing < 0 && stops.length >= MAX_STOPS) return (status.textContent = `You can save up to ${MAX_STOPS} stops. Remove one first.`);
  stopSelect.value = '';
  nameInput.value = '';
  await saveStops(existing < 0 ? [...stops, stop] : stops.with(existing, stop));
  status.textContent = `${existing < 0 ? 'Added' : 'Updated'} ${stop.route} ${stopLabel(stop)}.`;
});

// Start with the route of the most recently saved stop.
if (routeIndex) {
  showRoute(stops.length ? routeOf(stops.at(-1)) : DEFAULT_ROUTE);
} else {
  routeSelect.disabled = true;
  showTimetable(null);
  status.textContent = "Couldn't load the bus routes. Check your connection, then reopen this page.";
}

async function showRoute(routeId) {
  const request = ++loading;
  routeSelect.value = routeId;
  // A saved stop's route may no longer run, so it isn't in the list.
  if (routeSelect.value !== routeId) return showTimetable(null);
  // The previous route's stops stay on screen until this one loads, so Save can't pair them with this route.
  saveButton.disabled = true;
  status.textContent = `Loading route ${routeId}…`;
  const loaded = await loadTimetable(routeId);
  if (request !== loading) return;
  showTimetable(loaded);
  status.textContent = loaded ? '' : `Couldn't load route ${routeId}. Check your connection, then try again.`;
}

// Shows the directions and stops for `loaded`, or empties them when there's no timetable.
function showTimetable(loaded) {
  const previous = timetable && selectedDirection()?.name;
  timetable = loaded;
  saveButton.disabled = !timetable;
  const directions = timetable?.directions ?? [];
  // Keep the direction chosen before, if this route has one with the same name, or the last saved stop's.
  const preferred = [previous, stops.at(-1)?.direction].map((name) => directions.findIndex((d) => d.name === name)).find((i) => i >= 0) ?? 0;
  directionGroup.replaceChildren(
    directionGroup.querySelector('legend'),
    ...directions.map((direction, i) => {
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'direction', value: i, checked: i === preferred });
      input.addEventListener('change', renderStops);
      const label = document.createElement('label');
      label.append(input, directionName(direction.name));
      return label;
    }),
  );
  renderStops();
}

function selectedDirection() {
  const checked = directionGroup.querySelector('input:checked');
  return checked && timetable?.directions[checked.value];
}

function selectedStop() {
  const direction = selectedDirection();
  return {
    route: routeSelect.value,
    id: stopSelect.value,
    name: direction.stops.find((s) => s.id === stopSelect.value).name,
    direction: direction.name,
  };
}

// Returns the whole minutes entered, or undefined if they're out of range.
function nearMinutesInput() {
  const minutes = Math.round(nearInput.value);
  if (minutes >= 1 && minutes <= 60) return minutes;
}

async function saveStops(newStops) {
  stops = newStops;
  await chrome.storage.sync.set({ stops });
  renderWatching();
}

function renderWatching() {
  watching.hidden = !stops.length;
  empty.hidden = Boolean(stops.length);
  count.textContent = stops.length ? `${stops.length} of ${MAX_STOPS}` : '';
  watching.replaceChildren(
    ...stops.map((stop) => {
      const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
      remove.setAttribute('aria-label', `Remove ${routeOf(stop)} ${stopLabel(stop)}`);
      remove.addEventListener('click', async () => {
        await saveStops(stops.filter((s) => s !== stop));
        status.textContent = `Removed ${routeOf(stop)} ${stopLabel(stop)}.`;
      });
      const details = [
        routeOf(stop),
        stop.label && displayName(stop.name),
        directionName(stop.direction),
        `flashes at ${stop.nearMinutes ?? DEFAULT_NEAR_MINUTES} min`,
      ];
      const name = document.createElement('span');
      name.append(stopLabel(stop), Object.assign(document.createElement('small'), { textContent: details.filter(Boolean).join(' · ') }));
      const item = document.createElement('li');
      item.append(name, remove);
      return item;
    }),
  );
}

function renderStops() {
  const direction = selectedDirection();
  stopSelect.replaceChildren(
    new Option(direction ? 'Choose a stop…' : 'Choose a route first', ''),
    ...(direction ? direction.stops.map((s) => new Option(displayName(s.name), s.id)) : []),
  );
}

function renderLegend(nearMinutes) {
  const items = [
    ['43', LEVELS.scheduled, 'Scheduled; bus not tracked live yet'],
    [String(nearMinutes + 5), LEVELS.far, `Live; more than ${nearMinutes} min away`],
    [String(Math.max(1, nearMinutes - 5)), LEVELS.near, `Live; ${nearMinutes} min or less (flashes)`],
  ];
  legend.replaceChildren(
    ...items.map(([label, level, description]) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
      paintIcon(canvas.getContext('2d'), 32, label, level);
      const item = document.createElement('li');
      item.append(canvas, description);
      return item;
    }),
  );
}
