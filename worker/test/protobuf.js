// Encodes small GTFS-Realtime feeds for tests, with only the fields the decoder reads.

function varint(value) {
  const bytes = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return bytes;
}

const number = (field, value) => [...varint(field << 3), ...varint(value)];
const bytes = (field, content) => [...varint((field << 3) | 2), ...varint(content.length), ...content];
const string = (field, value) => bytes(field, [...new TextEncoder().encode(value)]);

function stopTimeUpdate({ stopId, arrival, departure, relationship }) {
  return [
    ...(arrival ? bytes(2, number(2, arrival)) : []),
    ...(departure ? bytes(3, number(2, departure)) : []),
    ...string(4, stopId),
    ...(relationship ? number(5, relationship) : []),
  ];
}

function tripUpdate({ tripId, routeId, relationship, stops }) {
  const trip = [...string(1, tripId), ...(relationship ? number(4, relationship) : []), ...string(5, routeId)];
  return [...bytes(1, trip), ...stops.flatMap((stop) => bytes(2, stopTimeUpdate(stop)))];
}

export function feed(timestamp, trips) {
  const header = [...string(1, '2.0'), ...(timestamp ? number(3, timestamp) : [])];
  const entities = trips.flatMap((trip, i) => bytes(2, [...string(1, String(i)), ...bytes(3, tripUpdate(trip))]));
  return new Uint8Array([...bytes(1, header), ...entities]);
}
