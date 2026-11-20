# P78

A Chrome extension that counts down to the next PRT P78 bus at your stop in the toolbar.

| Icon | Meaning |
| --- | --- |
| Light grey | Scheduled; the bus isn't tracked live yet |
| Black | Live, far away |
| Gold, flashing | Live, near (you set the minutes; default 10) |

Live arrivals come from PRT's feed, about 390 KB per download. To keep that load down, the extension downloads it at most once a minute, only while a bus is scheduled within the next 30 minutes (or up to 15 minutes ago, in case it's late), and only while you're using the computer. The rest of the time the icon counts down to the scheduled time.

## Chrome extension

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose the `extension` folder.
3. Save up to 4 stops, each with an optional name and its own flash time.

The icon shows one stop at a time. Right-click it to switch stops, or to **Ignore** a bus you won't catch: the countdown turns grey and stops flashing. Choose **Watch** to undo it. Click the icon to open the stop on PRT TrueTime.

## Landing page

`index.html` is served by GitHub Pages at [seanmcp.github.io/p78](https://seanmcp.github.io/p78/). It has the privacy policy and PRT's data notice.

## Tests

```sh
pnpm test
```

The tests cover the extension's feed decoder (`extension/gtfs-realtime.js`) and how the icon falls back to the schedule. They use Node's built-in test runner, so there is nothing to install.

The extension fetches PRT's feed directly. [context.md](context.md) explains why there is no server in between: a Cloudflare Worker that copied the feed for all users was tried and removed.

## Data

> Reproduced with permission granted by Pittsburgh Regional Transit (PRT). The information has been provided by means of a nonexclusive, limited, and revocable license granted by PRT. PRT does not guarantee the accuracy, adequacy, completeness, or usefulness of any information. PRT provides this information "as is" without warranty of any kind, express or implied, including, but not limited to, warranties of merchantability or fitness for a particular purpose and assumes no responsibility for anyone's use of the information.

Live arrivals come from PRT's public [GTFS-Realtime feed](https://truetime.rideprt.org/gtfsrt-bus/trips). Stops and schedules come from PRT's [GTFS data](https://www.rideprt.org/developerresources/GTFS.zip):

- `data/routes.json` lists every bus route and its directions.
- `data/routes/<route>.json` has one route's stops, schedules, and service calendars. GitHub Pages serves these at `seanmcp.github.io/p78/data/`.
- The extension downloads the files for the routes it shows, and keeps them for up to 12 hours.

The [Update schedule data](.github/workflows/schedule-data.yml) action rebuilds these files daily and commits them when PRT's schedule changes. To build them yourself, download and unzip the GTFS data, then run:

```sh
node scripts/build-stops.mjs path/to/GTFS
```
