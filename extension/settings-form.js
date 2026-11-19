// The settings form, shared by the extension's options dialog and the web page.
// `storage` has the chrome.storage.sync shape: get(keys) and set(items), both async.
import { displayName } from './arrival.js';
import { DEFAULT_NEAR_MINUTES, LEVELS, paintIcon } from './icon.js';

export async function initSettings(container, storage, timetable, onChange = () => {}) {
  container.innerHTML = `
    <fieldset id="direction"><legend>Direction</legend></fieldset>
    <label for="stop" class="heading">Stop</label>
    <select id="stop"></select>
    <label class="inline">
      Flash when the bus is <input id="near" type="number" min="1" max="60" /> minutes away or less
    </label>
    <p id="status" role="status"></p>
    <p class="heading">Reading the icon</p>
    <ul id="legend"></ul>
  `;
  const directionGroup = container.querySelector('#direction');
  const stopSelect = container.querySelector('#stop');
  const nearInput = container.querySelector('#near');
  const status = container.querySelector('#status');
  const legend = container.querySelector('#legend');

  const { directions } = timetable;
  const { stop: saved, nearMinutes = DEFAULT_NEAR_MINUTES } = await storage.get(['stop', 'nearMinutes']);
  const savedDirection = Math.max(0, directions.findIndex((d) => d.name === saved?.direction));

  directions.forEach((direction, i) => {
    const [heading, destination] = direction.name.split('-');
    const input = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'direction',
      value: i,
      checked: i === savedDirection,
    });
    input.addEventListener('change', renderStops);
    const label = document.createElement('label');
    label.append(input, `${displayName(heading)} to ${displayName(destination)}`);
    directionGroup.append(label);
  });

  renderStops();
  renderLegend(nearMinutes);
  nearInput.value = nearMinutes;
  if (saved) {
    stopSelect.value = saved.id;
    status.textContent = `Watching ${displayName(saved.name)}.`;
  }

  stopSelect.addEventListener('change', async () => {
    if (!stopSelect.value) return;
    const direction = selectedDirection();
    const stop = { id: stopSelect.value, name: direction.stops.find((s) => s.id === stopSelect.value).name, direction: direction.name };
    await storage.set({ stop });
    status.textContent = `Saved. Watching ${displayName(stop.name)}.`;
    onChange();
  });

  nearInput.addEventListener('change', async () => {
    const minutes = Math.round(nearInput.value);
    if (!(minutes >= 1 && minutes <= 60)) return (nearInput.value = nearMinutes);
    await storage.set({ nearMinutes: minutes });
    renderLegend(minutes);
    status.textContent = `Saved. Flashing at ${minutes} min or less.`;
    onChange();
  });

  function selectedDirection() {
    return directions[directionGroup.querySelector('input:checked').value];
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
