import { isRecord, readStored, writeStored } from './persistedState.ts'

function validateNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

beforeEach(() => {
  localStorage.clear()
})

it('round-trips a value', () => {
  writeStored('answer', 42)

  expect(readStored('answer', validateNumber)).toEqual(42)
  // Namespaced, so the app can't collide with anything else on the origin.
  expect(localStorage.getItem('sequenceTubeMap.answer')).toEqual('42')
})

it('reports a missing value as undefined', () => {
  expect(readStored('answer', validateNumber)).toBeUndefined()
})

it('ignores a value of the wrong shape', () => {
  writeStored('answer', 'forty-two')

  expect(readStored('answer', validateNumber)).toBeUndefined()
})

it('ignores unparseable JSON instead of throwing', () => {
  localStorage.setItem('sequenceTubeMap.answer', '{not json')

  expect(readStored('answer', validateNumber)).toBeUndefined()
})

it('keeps null apart from a missing value', () => {
  writeStored('limit', null)

  expect(readStored('limit', value => (value === null ? null : undefined))).toBeNull()
})

it('recognizes plain objects only', () => {
  expect(isRecord({ a: 1 })).toBe(true)
  expect(isRecord([1])).toBe(false)
  expect(isRecord(null)).toBe(false)
  expect(isRecord('x')).toBe(false)
})
