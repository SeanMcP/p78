# P78

A Chrome extension that counts down to the next PRT P78 bus at your stop in the toolbar.

| Icon | Meaning |
| --- | --- |
| Light grey | Scheduled; the bus isn't tracked live yet |
| Black | Live, far away |
| Gold, flashing | Live, near (you set the minutes; default 10) |

## Chrome extension

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose the `extension` folder.
3. Pick your direction and stop.

Click the icon to open your stop on PRT TrueTime. Right-click it to **Ignore** a bus you won't catch: the countdown turns grey and stops flashing. Choose **Watch** to undo it.

## Landing page

`index.html` is served by GitHub Pages at [seanmcp.github.io/p78](https://seanmcp.github.io/p78/). It has the privacy policy and PRT's data notice.

## Data

> Reproduced with permission granted by Pittsburgh Regional Transit (PRT). The information has been provided by means of a nonexclusive, limited, and revocable license granted by PRT. PRT does not guarantee the accuracy, adequacy, completeness, or usefulness of any information. PRT provides this information "as is" without warranty of any kind, express or implied, including, but not limited to, warranties of merchantability or fitness for a particular purpose and assumes no responsibility for anyone's use of the information.

Live arrivals come from PRT's public [GTFS-Realtime feed](https://truetime.rideprt.org/gtfsrt-bus/trips). Stops and schedules come from PRT's [GTFS data](https://www.rideprt.org/developerresources/GTFS.zip), bundled in `extension/stops.json`. The current schedule data runs through Feb 20, 2027. When PRT publishes a new schedule, download and unzip it, then run:

```sh
node scripts/build-stops.mjs path/to/GTFS
```
