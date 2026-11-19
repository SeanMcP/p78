// Minimal GTFS-Realtime decoder: only reads the fields needed for arrival times.
// Field numbers come from https://gtfs.org/documentation/realtime/proto/

function readVarint(bytes, pos) {
  let value = 0;
  let multiplier = 1;
  let byte;
  do {
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

// Returns { tripId, time } for each bus on a route arriving at a stop, soonest first. Times are Unix seconds.
export function arrivalsAt(feedBytes, routeId, stopId) {
  const arrivals = [];
  for (const [field, entity] of readFields(feedBytes)) {
    if (field !== 2) continue;
    for (const [entityField, tripUpdate] of readFields(entity)) {
      if (entityField !== 3) continue;
      let tripId;
      let route;
      let time;
      for (const [tripField, value] of readFields(tripUpdate)) {
        if (tripField === 1) {
          for (const [descriptorField, id] of readFields(value)) {
            if (descriptorField === 1) tripId = text.decode(id);
            if (descriptorField === 5) route = text.decode(id);
          }
        } else if (tripField === 2) {
          let stop;
          let arrival;
          let departure;
          for (const [updateField, updateValue] of readFields(value)) {
            if (updateField === 4) stop = text.decode(updateValue);
            if (updateField === 2) arrival = readEventTime(updateValue);
            if (updateField === 3) departure = readEventTime(updateValue);
          }
          if (stop === stopId) time = arrival ?? departure;
        }
      }
      if (route === routeId && time) arrivals.push({ tripId, time });
    }
  }
  return arrivals.sort((a, b) => a.time - b.time);
}
