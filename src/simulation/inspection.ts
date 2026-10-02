import type { InspectionResult } from '../types'
import { integerIn, numberIn, object, text } from './recipes'

export function validateInspectionResult(value: unknown): InspectionResult {
  const input = object(value, 'Inspection result')
  if (input.schemaVersion !== 1) throw new Error('Unsupported inspection schema')
  if (input.decision !== 'accept' && input.decision !== 'reject')
    throw new Error('Inspection decision must be accept or reject')
  return {
    schemaVersion: 1,
    eventId: text(input.eventId, 100, 'Event ID'),
    frameId: text(input.frameId, 100, 'Frame ID'),
    packageId: integerIn(input.packageId, 1, 1000000, 'Package ID'),
    capturedAtMs: integerIn(input.capturedAtMs, 0, 600000, 'Capture time'),
    decision: input.decision,
    score: numberIn(input.score, 0, 1, 'Model score'),
  }
}

export const inspectionFixture: InspectionResult = {
  schemaVersion: 1,
  eventId: 'fixture-event-001',
  frameId: 'fixture-frame-001',
  packageId: 1,
  capturedAtMs: 4000,
  decision: 'reject',
  score: 0.94,
}
