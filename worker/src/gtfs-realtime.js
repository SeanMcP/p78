// Minimal GTFS-Realtime decoder: reads only the fields needed for arrival times.
// Field numbers come from https://gtfs.org/documentation/realtime/proto/

const CANCELED = 3; // TripDescriptor.ScheduleRelationship
const SKIPPED = 1; // StopTimeUpdate.ScheduleRelationship
const NO_DATA = 2;

function readVarint(bytes, pos) {
  let value = 0;
  let multiplier = 1;
  let byte;
  do {
    if (pos >= bytes.length) throw new Error('Truncated varint');
    byte = bytes[pos++];
    value += (byte & 0x7f) * multiplier;
    multiplier *= 128;
  } while (byte & 0x80);
  return [value, pos];
}

export function* readFields(bytes) {
  let pos = 0;
  while (pos < bytes.length) {
    let tag;
    [tag, pos] = readVarint(bytes, pos);
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      let value;
      [value, pos] = readVarint(bytes, pos);
      yield [field, value];
    } else if (wireType === 2) {
      let length;
      [length, pos] = readVarint(bytes, pos);
      if (pos + length > bytes.length) throw new Error('Truncated field');
      yield [field, bytes.subarray(pos, pos + length)];
      pos += length;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
}

const text = new TextDecoder();

function readEventTime(bytes) {
  for (const [field, value] of readFields(bytes)) {
    if (field === 2) return value;
  }
}

function readTripUpdate(bytes) {
  let tripId;
  let routeId;
  let canceled = false;
  const stops = [];
  for (const [field, value] of readFields(bytes)) {
    if (field === 1) {
      for (const [descriptorField, descriptorValue] of readFields(value)) {
        if (descriptorField === 1) tripId = text.decode(descriptorValue);
        else if (descriptorField === 5) routeId = text.decode(descriptorValue);
        else if (descriptorField === 4 && descriptorValue === CANCELED) canceled = true;
      }
    } else if (field === 2) {
      let stopId;
      let arrival;
      let departure;
      let relationship = 0;
      for (const [updateField, updateValue] of readFields(value)) {
        if (updateField === 4) stopId = text.decode(updateValue);
        else if (updateField === 2) arrival = readEventTime(updateValue);
        else if (updateField === 3) departure = readEventTime(updateValue);
        else if (updateField === 5) relationship = updateValue;
      }
      const time = arrival ?? departure;
      if (stopId && time && relationship !== SKIPPED && relationship !== NO_DATA) stops.push([stopId, time]);
    }
  }
  return { tripId, routeId, canceled, stops };
}

// Decodes a FeedMessage into the compact arrivals file:
//   { feedTime, routes: { [routeId]: { [stopId]: [[tripId, secondsAfterFeedTime], ...] } } }
// Each stop's list is soonest first. Arrivals more than `pastSeconds` before the feed time are dropped,
// and so are canceled trips and skipped stops.
export function decodeArrivals(feedBytes, { pastSeconds = 60 } = {}) {
  let feedTime;
  const trips = [];
  for (const [field, value] of readFields(feedBytes)) {
    if (field === 1) {
      for (const [headerField, headerValue] of readFields(value)) {
        if (headerField === 3) feedTime = headerValue;
      }
    } else if (field === 2) {
      for (const [entityField, entityValue] of readFields(value)) {
        if (entityField === 3) trips.push(readTripUpdate(entityValue));
      }
    }
  }
  if (!feedTime) throw new Error('Feed has no header timestamp');

  const routes = {};
  for (const { tripId, routeId, canceled, stops } of trips) {
    if (canceled || !tripId || !routeId) continue;
    const route = (routes[routeId] ??= {});
    for (const [stopId, time] of stops) {
      const offset = time - feedTime;
      if (offset < -pastSeconds) continue;
      (route[stopId] ??= []).push([tripId, offset]);
    }
  }
  for (const route of Object.values(routes)) {
    for (const arrivals of Object.values(route)) arrivals.sort((a, b) => a[1] - b[1]);
  }
  return { feedTime, routes };
}
