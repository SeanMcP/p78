// Finds the next scheduled arrival (Unix seconds) at a stop from the bundled GTFS timetable.
const LOOKAHEAD_DAYS = 7;

function gtfsDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function runsOn(service, date) {
  const day = gtfsDate(date);
  if (service.added.includes(day)) return true;
  if (service.removed.includes(day)) return false;
  const weekday = (date.getDay() + 6) % 7; // GTFS weeks start on Monday
  return service.days[weekday] && day >= service.start && day <= service.end;
}

export function nextScheduled({ services }, stop, now = Date.now() / 1000) {
  const today = new Date(now * 1000);
  // Start from yesterday: GTFS times past 24:00 belong to the previous service day.
  for (let offset = -1; offset <= LOOKAHEAD_DAYS; offset++) {
    const serviceDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dayStart = serviceDay.getTime() / 1000;
    const times = Object.entries(stop.times)
      .filter(([serviceId]) => runsOn(services[serviceId], serviceDay))
      .flatMap(([, seconds]) => seconds.map((s) => dayStart + s))
      .filter((time) => time > now);
    if (times.length) return Math.min(...times);
  }
}
