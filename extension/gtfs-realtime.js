// Minimal GTFS-Realtime decoder: reads only the fields needed for arrival times.
// Field numbers come from https://gtfs.org/documentation/realtime/proto/

// TripDescriptor.ScheduleRelationship values for trips that riders must not be shown.
const CANCELED = 3;
const DELETED = 7;
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

function* readFields(bytes) {
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
    } else if (wireType === 1 || wireType === 5) {
      pos += wireType === 1 ? 8 : 4;
      if (pos > bytes.length) throw new Error('Truncated field');
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

// The feed's header timestamp in Unix seconds: when PRT produced it. Reads only the header, so it's cheap.
export function feedTime(feedBytes) {
  for (const [field, header] of readFields(feedBytes)) {
    if (field !== 1) continue;
    for (const [headerField, value] of readFields(header)) {
      if (headerField === 3) return value;
    }
  }
}

// Returns { tripId, time } for each bus on a route arriving at a stop, soonest first. Times are Unix seconds.
// A trip that passes the stop twice, as on a loop, appears once for each visit. Canceled and deleted trips
// are left out, and so are skipped stops. Stops with NO_DATA are left out too, so they get no live time
// rather than a wrong one. Throws if the feed is truncated or malformed.
export function arrivalsAt(feedBytes, routeId, stopId) {
  const arrivals = [];
  for (const [field, entity] of readFields(feedBytes)) {
    if (field !== 2) continue;
    for (const [entityField, tripUpdate] of readFields(entity)) {
      if (entityField !== 3) continue;
      let tripId;
      let route;
      let removed = false;
      const times = [];
      for (const [tripField, value] of readFields(tripUpdate)) {
        if (tripField === 1) {
          for (const [descriptorField, descriptorValue] of readFields(value)) {
            if (descriptorField === 1) tripId = text.decode(descriptorValue);
            else if (descriptorField === 5) route = text.decode(descriptorValue);
            else if (descriptorField === 4 && (descriptorValue === CANCELED || descriptorValue === DELETED)) removed = true;
          }
        } else if (tripField === 2) {
          let stop;
          let arrival;
          let departure;
          let relationship = 0;
          for (const [updateField, updateValue] of readFields(value)) {
            if (updateField === 4) stop = text.decode(updateValue);
            else if (updateField === 2) arrival = readEventTime(updateValue);
            else if (updateField === 3) departure = readEventTime(updateValue);
            else if (updateField === 5) relationship = updateValue;
          }
          const time = arrival ?? departure;
          if (stop === stopId && time && relationship !== SKIPPED && relationship !== NO_DATA) times.push(time);
        }
      }
      if (route === routeId && !removed) for (const time of times) arrivals.push({ tripId, time });
    }
  }
  return arrivals.sort((a, b) => a.time - b.time);
}
