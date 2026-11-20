# Context: the feed worker we tried and removed

The extension fetches PRT's GTFS-Realtime feed directly from `truetime.rideprt.org`. On November 20, 2026 we built a Cloudflare Worker to fetch the feed once for all users instead, ran it for about two hours, and removed it. This file explains what we tried, why it failed, and why we removed it rather than fixing it, so the next attempt can start from what we learned.

The code is in the commits of [PR #8](https://github.com/SeanMcP/p78/pull/8). The plan it came from is in [issue #5](https://github.com/SeanMcP/p78/issues/5).

## The goal

Each extension downloads PRT's full feed, about 390 KB of uncompressed protobuf, every 30 seconds. With many users, PRT would get thousands of requests a minute for the same file. The plan in #5 was a worker that fetches the feed once a minute on a Cron Trigger, stores the result in R2, and serves it through the Cloudflare cache. PRT would get one request a minute no matter how many people used the extension.

The worker had to fit Cloudflare's free plan, which allows 10 ms of CPU time per run.

## Attempt 1: decode the feed into JSON (commit dce85f3)

The worker decoded the feed and wrote a compact JSON file with each route's arrivals by stop. It was about 180 KB, or 43 KB with gzip.

**It used too much CPU.** On Cloudflare, each run used 34–56 ms of CPU, 3 to 5 times the free limit. The same work took 6–13 ms on a Mac, so the runs probably started cold each time: with one run a minute, the JavaScript was rarely optimized. A rewrite of the decoder without generators was only about 20% faster. The cost comes from reading the whole feed, which every route's output needs, so a smaller output doesn't help. The remaining idea was a decoder compiled to WebAssembly, and we judged it too much complexity for the gain.

## Attempt 2: copy the feed unchanged (commit b6c4027)

The worker stopped decoding. It checked the feed's header timestamp and copied the bytes to R2 as `v1/trips.pb`, and the extension decoded it. This used 1.2–2.2 ms of CPU, well within the free plan. Cloudflare compressed the file to about 113 KB with Brotli.

To serve it, we:

- moved `smcp.dev`'s DNS from Netlify to Cloudflare, because R2 custom domains need a full Cloudflare zone;
- connected `pghstopwatch.smcp.dev` to an R2 bucket;
- added a cache rule so the file was cached for its `max-age` of 30 seconds.

A review (commit f51a271) made the worker reject feeds that were cut off partway through, so a bad response couldn't replace the last good copy.

**About a quarter of runs couldn't reach PRT.** In the first 36 runs, 9 failed with HTTP 522: Cloudflare couldn't connect to PRT's server, and gave up after about 19 seconds. PRT's server isn't behind Cloudflare. From a Mac, the same URL always worked. A failed run kept the last good copy, but two failures in a row made the copy older than 3 minutes. The extension treats a copy that old as unavailable and shows scheduled times instead.

**Trying again within a run didn't help (commit 2202ee0).** We gave each run two attempts with a 10-second timeout each. Over the next hour, 14 of 59 runs still failed (24%). In every failed run, both attempts timed out, and every successful run worked on its first attempt. A run either reached PRT or it didn't, so the cause was something about the run, not the individual connection. Commit 1ed3713 removed the retry.

**We couldn't choose where the worker runs.** The most likely cause is the Cloudflare data center a run lands in. Cloudflare says Cron Triggers run "on underutilized machines" anywhere in its network, and the logs don't record which one. Cloudflare's placement settings run a worker near a given server, but they apply only to fetch handlers, the code that answers web requests. Workers without one, like this cron-only worker, are ignored. The workaround was two workers: a cron worker calling a second, placed worker through a service binding. It might not have been free, it might not have fixed the failures, and it doubled the moving parts.

## Why we removed it instead of fixing it

- **The complexity outgrew the benefit.** The worker existed to spare PRT load. By this point it needed a domain, an R2 bucket, a cache rule, monitoring, and possibly a second worker, and it still failed a quarter of the time.
- **Fetching directly works.** Users' own connections reach PRT reliably, and the 522 failures happen only from Cloudflare.
- **The extension can reduce its own load.** #5 already plans to fetch only when the next bus is due within 30 minutes, to stop while the computer is idle or locked, and to refresh every 60 seconds instead of 30. With those, a typical user makes a few dozen requests a day rather than about 2,900.
- **A public copy is a legal risk.** PRT's [TrueTime terms](https://truetime.rideprt.org/bustime/ta/PAAC/terms2.jsp) say that a copy of the information on a different website needs PRT's permission. The worker served exactly that. Fetching directly redistributes nothing.

All the Cloudflare resources were deleted: the worker, the R2 bucket and its file, the custom domain, and the cache rule. The old `p78-feed` proxy worker went too. The `smcp.dev` zone stays on Cloudflare's free plan, with no records.

## What we kept

- **Decoder fixes** in `extension/gtfs-realtime.js`. These came out of the worker work, but the extension needs them either way.
  - Canceled and deleted trips are left out. The feed had 5 canceled trips on November 20, and the extension had shown them as live buses.
  - Skipped stops, and stops with no data, are left out.
  - A trip that passes the same stop twice lists both visits, not only the last.
  - Feeds cut off inside a field are rejected, including fixed-width fields.
  - `feedTime()` reads the header timestamp.
- **A fallback** in `extension/arrival.js`: a feed that can't be decoded counts as unavailable, so the icon shows scheduled times instead of freezing.
- **Tests:** `pnpm test` runs them with Node's built-in runner.

## If this comes back

Do it if PRT asks for less traffic, or if the user count makes direct fetching a problem. Ask PRT for permission first, since a shared copy is redistribution.

- **Start from b6c4027 and f51a271:** the copier, and its check that the whole feed is present.
- **Run it somewhere you can choose the location,** or test PRT's reachability from Cloudflare before building on Workers. A small VM or a scheduled job near Pittsburgh avoids the placement problem.
- **Workers gotchas we hit:**
  - Every named export of the main module is treated as an entrypoint, so exporting a constant from it breaks the deploy.
  - Changes to Cron Triggers take up to 15 minutes to take effect, including removing them.
  - Cloudflare doesn't cache JSON or protobuf by default, so a cache rule is needed.
