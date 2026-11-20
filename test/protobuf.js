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

export const number = (field, value) => [...varint(field << 3), ...varint(value)];
export const bytes = (field, content) => [...varint((field << 3) | 2), ...varint(content.length), ...content];
export const string = (field, value) => bytes(field, [...new TextEncoder().encode(value)]);
// Fixed-width fields, as protobuf extensions can use: wire type 1 (8 bytes) and 5 (4 bytes).
export const fixed64 = (field) => [...varint((field << 3) | 1), 1, 2, 3, 4, 5, 6, 7, 8];
export const fixed32 = (field) => [...varint((field << 3) | 5), 1, 2, 3, 4];

function stopTimeUpdate({ stopId, arrival, departure, relationship }) {
  return [
    ...(arrival ? bytes(2, number(2, arrival)) : []),
    ...(departure ? bytes(3, number(2, departure)) : []),
    ...string(4, stopId),
    ...(relationship !== undefined ? number(5, relationship) : []),
  ];
}

function tripUpdate({ tripId, routeId, relationship, stops }) {
  const trip = [...string(1, tripId), ...(relationship !== undefined ? number(4, relationship) : []), ...string(5, routeId)];
  return [...bytes(1, trip), ...stops.flatMap((stop) => bytes(2, stopTimeUpdate(stop)))];
}

// `header` replaces the usual header fields (version, then timestamp), to test other orders and extensions.
// `headerLast` puts the header after the entities: unusual, but valid protobuf.
export function feed(timestamp, trips, { header, headerLast = false } = {}) {
  const headerFields = header ?? [...string(1, '2.0'), ...(timestamp ? number(3, timestamp) : [])];
  const entities = trips.flatMap((trip, i) => bytes(2, [...string(1, String(i)), ...bytes(3, tripUpdate(trip))]));
  const headerMessage = bytes(1, headerFields);
  return new Uint8Array(headerLast ? [...entities, ...headerMessage] : [...headerMessage, ...entities]);
}
