import { initSettings } from './settings-form.js';

const timetable = await (await fetch('stops.json')).json();
initSettings(document.getElementById('settings'), chrome.storage.sync, timetable);
