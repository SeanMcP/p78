// The settings form in the extension's options dialog.
// `storage` has the chrome.storage.sync shape: get(keys) and set(items), both async.
// With `multiple`, a Save button adds stops, each with its own flash time, to a list in `stops`.
// Without it, changes save as soon as they're made to `stop` and `nearMinutes`.
import { displayName } from './arrival.js';
import { DEFAULT_NEAR_MINUTES, LEVELS, paintIcon } from './icon.js';

export async function initSettings(container, storage, timetable, onChange = () => {}, { multiple = false } = {}) {
  container.innerHTML = `
    <ul id="watching"></ul>
    <fieldset id="direction"><legend>Direction</legend></fieldset>
    <label for="stop" class="heading">${multiple ? 'Add a stop' : 'Stop'}</label>
    <select id="stop"></select>
    <label class="inline">
      Flash when the bus is <input id="near" type="number" min="1" max="60" /> minutes away or less
    </label>
    <button id="save" type="button">Save</button>
    <p id="status" role="status"></p>
    <p class="heading">Reading the icon</p>
    <ul id="legend"></ul>
    <p id="notice"></p>
  `;
  const directionGroup = container.querySelector('#direction');
  const stopSelect = container.querySelector('#stop');
  const nearInput = container.querySelector('#near');
  const status = container.querySelector('#status');
  const legend = container.querySelector('#legend');
  const watching = container.querySelector('#watching');
  const saveButton = container.querySelector('#save');
  container.querySelector('#notice').textContent = timetable.notice;

  const { directions } = timetable;
  const { stop: saved, stops: savedStops = [], nearMinutes = DEFAULT_NEAR_MINUTES } = await storage.get(['stop', 'stops', 'nearMinutes']);
  let stops = savedStops;
  const lastDirection = (multiple ? stops.at(-1) : saved)?.direction;
  const savedDirection = Math.max(0, directions.findIndex((d) => d.name === lastDirection));

  directions.forEach((direction, i) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'direction',
      value: i,
      checked: i === savedDirection,
    });
    input.addEventListener('change', renderStops);
    const label = document.createElement('label');
    label.append(input, directionName(direction.name));
    directionGroup.append(label);
  });

  renderStops();
  renderWatching();
  saveButton.hidden = !multiple;
  renderLegend(nearMinutes);
  nearInput.value = nearMinutes;
  if (saved && !multiple) {
    stopSelect.value = saved.id;
    status.textContent = `Watching ${displayName(saved.name)}.`;
  }

  stopSelect.addEventListener('change', async () => {
    if (multiple || !stopSelect.value) return;
    const stop = selectedStop();
    await storage.set({ stop });
    status.textContent = `Saved. Watching ${displayName(stop.name)}.`;
    onChange();
  });

  nearInput.addEventListener('change', async () => {
    const minutes = nearMinutesInput();
    if (!minutes) return (nearInput.value = nearMinutes);
    renderLegend(minutes);
    if (multiple) return;
    await storage.set({ nearMinutes: minutes });
    status.textContent = `Saved. Flashing at ${minutes} min or less.`;
    onChange();
  });

  saveButton.addEventListener('click', async () => {
    if (!stopSelect.value) return (status.textContent = 'Choose a stop first.');
    const stop = { ...selectedStop(), nearMinutes: nearMinutesInput() ?? nearMinutes };
    stopSelect.value = '';
    await saveStops([...stops.filter((s) => !(s.id === stop.id && s.direction === stop.direction)), stop]);
    status.textContent = `Added ${displayName(stop.name)}.`;
    onChange();
  });

  function selectedDirection() {
    return directions[directionGroup.querySelector('input:checked').value];
  }

  function selectedStop() {
    const direction = selectedDirection();
    return { id: stopSelect.value, name: direction.stops.find((s) => s.id === stopSelect.value).name, direction: direction.name };
  }

  // Returns the whole minutes entered, or undefined if they're out of range.
  function nearMinutesInput() {
    const minutes = Math.round(nearInput.value);
    if (minutes >= 1 && minutes <= 60) return minutes;
  }

  async function saveStops(newStops) {
    stops = newStops;
    await storage.set({ stops });
    renderWatching();
  }

  function renderWatching() {
    watching.hidden = !multiple || !stops.length;
    watching.replaceChildren(
      ...stops.map((stop) => {
        const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
        remove.setAttribute('aria-label', `Remove ${displayName(stop.name)}`);
        remove.addEventListener('click', async () => {
          await saveStops(stops.filter((s) => s !== stop));
          status.textContent = `Removed ${displayName(stop.name)}.`;
          onChange();
        });
        const name = document.createElement('span');
        const details = `${directionName(stop.direction)} · flashes at ${stop.nearMinutes ?? nearMinutes} min`;
        name.append(displayName(stop.name), Object.assign(document.createElement('small'), { textContent: details }));
        const item = document.createElement('li');
        item.append(name, remove);
        return item;
      }),
    );
  }

  function renderStops() {
    stopSelect.replaceChildren(
      new Option('Choose a stop…', ''),
      ...selectedDirection().stops.map((s) => new Option(displayName(s.name), s.id)),
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
}

function directionName(name) {
  const [heading, destination] = name.split('-');
  return `${displayName(heading)} to ${displayName(destination)}`;
}
