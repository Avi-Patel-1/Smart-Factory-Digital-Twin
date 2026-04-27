import type { MachineState, TagQuality, TagRecord, TagValue } from '../types'

function makeTag(
  name: string,
  type: TagRecord['type'],
  value: TagValue,
  source: string,
  description: string,
): TagRecord {
  return {
    name,
    type,
    value,
    source,
    description,
    lastChangedMs: 0,
    quality: 'Good',
  }
}

export function createTagDatabase(): Record<string, TagRecord> {
  const tags = [
    makeTag('MTR_CONV_RUN', 'BOOL', false, 'PLC output', 'Conveyor motor run command'),
    makeTag('MTR_CONV_FAULT', 'BOOL', false, 'Drive input', 'Conveyor drive fault feedback'),
    makeTag('MTR_CONV_SPEED_PCT', 'REAL', 0, 'Drive input', 'Commanded conveyor speed percent'),
    makeTag('MTR_CONV_CURRENT_A', 'REAL', 0, 'Drive input', 'Estimated motor current in amps'),
    makeTag('DRV_CONV_LOAD_PCT', 'REAL', 0, 'Drive input', 'Estimated conveyor drive load'),
    makeTag('PE_INFEED_BLOCKED', 'BOOL', false, 'Field input', 'Infeed photoeye blocked by package'),
    makeTag('PE_INSPECTION_PRESENT', 'BOOL', false, 'Field input', 'Package present at inspection station'),
    makeTag('PE_REJECT_CHUTE_CLEAR', 'BOOL', true, 'Field input', 'Reject chute clear confirmation'),
    makeTag('PE_EXIT_BLOCKED', 'BOOL', false, 'Field input', 'Exit photoeye blocked by discharged package'),
    makeTag('CYL_REJECT_EXT', 'BOOL', false, 'PLC output', 'Reject cylinder extend command'),
    makeTag('AIR_MAIN_OK', 'BOOL', true, 'Field input', 'Main compressed air permissive'),
    makeTag('ALM_JAM_INFEED', 'BOOL', false, 'PLC alarm', 'Infeed jam alarm bit'),
    makeTag('ALM_MOTOR_OVERLOAD', 'BOOL', false, 'PLC alarm', 'Motor overload alarm bit'),
    makeTag('ALM_SENSOR_STUCK', 'BOOL', false, 'PLC alarm', 'Sensor stuck diagnostic alarm bit'),
    makeTag('ALM_REJECT_GATE_FAIL', 'BOOL', false, 'PLC alarm', 'Reject diverter failed alarm bit'),
    makeTag('ALM_AIR_PRESSURE_LOW', 'BOOL', false, 'PLC alarm', 'Compressed air loss alarm bit'),
    makeTag('ALM_ESTOP_ACTIVE', 'BOOL', false, 'Safety input', 'Emergency stop alarm bit'),
    makeTag('CNT_GOOD_PARTS', 'DINT', 0, 'PLC counter', 'Good packages discharged'),
    makeTag('CNT_REJECTS', 'DINT', 0, 'PLC counter', 'Rejected packages diverted'),
    makeTag('CNT_TOTAL_PARTS', 'DINT', 0, 'PLC counter', 'Total completed packages'),
    makeTag('STATE_MACHINE', 'STRING', 'stopped', 'PLC register', 'Current machine state'),
    makeTag('MODE_AUTO', 'BOOL', true, 'HMI command', 'Auto mode selected'),
    makeTag('OEE_AVAILABILITY', 'REAL', 1, 'Edge calculation', 'Availability component of OEE'),
    makeTag('OEE_PERFORMANCE', 'REAL', 0, 'Edge calculation', 'Performance component of OEE'),
    makeTag('OEE_QUALITY', 'REAL', 1, 'Edge calculation', 'Quality component of OEE'),
    makeTag('OEE_OVERALL', 'REAL', 0, 'Edge calculation', 'Overall OEE value'),
    makeTag('PLC_SCAN_MS', 'DINT', 250, 'PLC task', 'Configured scan time in milliseconds'),
    makeTag('CELL_THROUGHPUT_PPM', 'REAL', 0, 'Edge calculation', 'Completed packages per minute'),
    makeTag('CYCLE_TIME_MS', 'REAL', 0, 'Edge calculation', 'Average actual cycle time'),
  ]

  return Object.fromEntries(tags.map((tag) => [tag.name, tag]))
}

export function cloneTagDatabase(tags: Record<string, TagRecord>): Record<string, TagRecord> {
  return Object.fromEntries(Object.entries(tags).map(([name, tag]) => [name, { ...tag }]))
}

export function setTagValue(
  tags: Record<string, TagRecord>,
  name: string,
  value: TagValue,
  elapsedMs: number,
  quality: TagQuality = 'Good',
): void {
  const tag = tags[name]
  if (!tag) {
    throw new Error(`Unknown tag ${name}`)
  }

  if (tag.value !== value || tag.quality !== quality) {
    tag.value = value
    tag.lastChangedMs = elapsedMs
    tag.quality = quality
  }
}

export function setMachineStateTag(
  tags: Record<string, TagRecord>,
  state: MachineState,
  elapsedMs: number,
): void {
  setTagValue(tags, 'STATE_MACHINE', state, elapsedMs)
}
