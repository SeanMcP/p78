// Forwards PRT's GTFS-Realtime feed with CORS headers so the web page can read it.
const FEED_URL = 'https://truetime.rideprt.org/gtfsrt-bus/trips';
const CACHE_SECONDS = 15;
const ALLOWED_ORIGINS = [/^https:\/\/seanmcp\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? '';
    if (!ALLOWED_ORIGINS.some((allowed) => allowed.test(origin))) {
      return new Response('Forbidden', { status: 403 });
    }

    const response = await fetch(FEED_URL, { cf: { cacheTtl: CACHE_SECONDS } });
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Access-Control-Allow-Origin': origin,
        'Cache-Control': `max-age=${CACHE_SECONDS}`,
        Vary: 'Origin',
      },
    });
  },
};
