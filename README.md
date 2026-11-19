# P78

Counts down to the next PRT P78 bus at your stop. It comes in two forms that share the same code:

- **Chrome extension:** the toolbar icon shows the countdown.
- **Web page** at [seanmcp.github.io/p78](https://seanmcp.github.io/p78/): the page and its tab icon show the countdown.

| Icon | Meaning |
| --- | --- |
| Light grey | Scheduled; the bus isn't tracked live yet |
| Navy | Live, far away |
| Gold, flashing | Live, near (you set the minutes; default 10) |

## Chrome extension

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose the `extension` folder.
3. Pick your direction and stop.

Click the icon to open your stop on PRT TrueTime. Right-click it to **Ignore** a bus you won't catch: the countdown turns grey and stops flashing. Choose **Watch** to undo it.

## Web page

`index.html` is served by GitHub Pages and saves settings in your browser. Add as many stops as you like, each with its own flash time. The tab icon shows the first one.

PRT's live feed blocks requests from websites, so the page reads it through a Cloudflare Worker that only answers `seanmcp.github.io` and `localhost`:

```sh
cd worker && pnpm dlx wrangler deploy
```

Put the worker's URL in `FEED_URL` in `web.js`. Without it, the page shows scheduled times only.

## Data

Live arrivals come from PRT's public [GTFS-Realtime feed](https://truetime.rideprt.org/gtfsrt-bus/trips). Stops and schedules come from PRT's [GTFS data](https://www.rideprt.org/developerresources/GTFS.zip), bundled in `extension/stops.json`. The current schedule data runs through Feb 20, 2027. When PRT publishes a new schedule, download and unzip it, then run:

```sh
node scripts/build-stops.mjs path/to/GTFS
```
