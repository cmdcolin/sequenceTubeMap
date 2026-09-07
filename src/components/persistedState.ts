// Small localStorage wrapper for UI preferences. Reads validate what comes
// back, since the stored JSON is whatever an older build (or the user) left
// behind, and both directions tolerate a storage that throws (Safari's
// private mode, or a browser configured to block site data).

const PREFIX = 'sequenceTubeMap.'

export function readStored<T>(
  key: string,
  validate: (value: unknown) => T | undefined,
): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? undefined : validate(JSON.parse(raw))
  } catch (e) {
    console.warn(`Ignoring unreadable stored value for ${key}:`, e)
    return undefined
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.warn(`Could not persist ${key}:`, e)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
