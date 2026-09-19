// Read-only decoder for the Datastore EntityProto/LevelDB log export emitted by
// Firestore emulator 1.22.0. Unknown/corrupt formats fail closed; never repair bytes.
export function protobufFields(bytes) {
  let offset = 0
  function varint() {
    let value = 0n
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (offset >= bytes.length) throw new Error('Truncated protobuf varint')
      const byte = bytes[offset++]
      value |= BigInt(byte & 127) << shift
      if (byte < 128) return value
    }
    throw new Error('Invalid protobuf varint')
  }
  function message(group) {
    const result = []
    while (offset < bytes.length) {
      const tag = Number(varint()), field = tag >>> 3, wire = tag & 7
      if (!field) throw new Error('Invalid protobuf field')
      if (wire === 4) {
        if (field !== group) throw new Error('Invalid protobuf group')
        return result
      }
      let value
      if (wire === 0) value = varint()
      else if (wire === 3) value = message(field)
      else if ([1, 2, 5].includes(wire)) {
        const length = wire === 2 ? Number(varint()) : wire === 1 ? 8 : 4
        if (!Number.isSafeInteger(length) || offset + length > bytes.length) throw new Error('Truncated protobuf field')
        value = bytes.subarray(offset, offset + length)
        offset += length
      } else throw new Error('Unsupported protobuf wire type')
      result.push({ field, value })
    }
    if (group) throw new Error('Unclosed protobuf group')
    return result
  }
  return message()
}
export const fieldValue = (fields, field) => fields.find(entry => entry.field === field)?.value

export function crc32c(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
  }
  return (~crc) >>> 0
}

export function logRecords(bytes) {
  const records = []
  let offset = 0, fragments = null
  while (offset < bytes.length) {
    const remaining = 32768 - offset % 32768
    if (remaining < 7) { offset += remaining; continue }
    if (offset + 7 > bytes.length) throw new Error('Truncated export log header')
    const size = bytes.readUInt16LE(offset + 4), type = bytes[offset + 6]
    if (!size && !type) {
      if (bytes.subarray(offset, Math.min(offset + remaining, bytes.length)).some(byte => byte !== 0)) throw new Error('Invalid export padding')
      offset += remaining; continue
    }
    if (size + 7 > remaining || offset + 7 + size > bytes.length) throw new Error('Truncated export log payload')
    const data = bytes.subarray(offset + 7, offset + 7 + size)
    const crc = crc32c(Buffer.concat([Buffer.from([type]), data]))
    const masked = (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0
    if (bytes.readUInt32LE(offset) !== masked) throw new Error('Export payload checksum mismatch')
    offset += 7 + size
    if (type === 1 && fragments === null) records.push(data)
    else if (type === 2 && fragments === null) fragments = [data]
    else if (type === 3 && fragments !== null) fragments.push(data)
    else if (type === 4 && fragments !== null) { records.push(Buffer.concat([...fragments, data])); fragments = null }
    else throw new Error('Invalid export record sequence')
  }
  if (fragments !== null) throw new Error('Incomplete export record')
  return records
}

export function entitySummary(bytes) {
  const fields = protobufFields(bytes), key = protobufFields(fieldValue(fields, 13))
  const project = fieldValue(key, 13)?.toString()
  if (project !== 'dev~demo-artvault') throw new Error(`Unexpected export project: ${project}`)
  const segments = protobufFields(fieldValue(key, 14)).filter(entry => entry.field === 1).map(entry => ({
    collection: fieldValue(entry.value, 2)?.toString(),
    id: fieldValue(entry.value, 4)?.toString() ?? String(fieldValue(entry.value, 3)),
  }))
  const properties = Object.fromEntries(fields.filter(entry => [14, 15].includes(entry.field)).map(entry => {
    const property = protobufFields(entry.value), value = protobufFields(fieldValue(property, 5))
    return [fieldValue(property, 3)?.toString(), fieldValue(value, 3)?.toString() ?? fieldValue(value, 2)?.toString() ?? null]
  }))
  return { segments, properties }
}
