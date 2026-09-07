import * as qs from 'qs'
import {
  DEFAULT_AVAILABLE_COLORS,
  type ColorScheme,
  type FileType,
  type Palette,
  type Track,
  type Tracks,
  type ViewTarget,
} from './Types.ts'

const FILE_TYPES = [
  'graph',
  'node',
  'haplotype',
  'read',
  'bed',
  'translation',
] as const satisfies readonly FileType[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? [...value] : undefined
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

// qs has no way to tell the boolean true from the string "true", so every
// boolean in the query arrives as a string and has to be coerced back.
function asBoolean(value: unknown) {
  return typeof value === 'boolean'
    ? value
    : value === 'true'
      ? true
      : value === 'false'
        ? false
        : undefined
}

function asPalette(value: unknown): Palette | undefined {
  const name = asString(value)
  return name === undefined
    ? undefined
    : name.startsWith('#')
      ? `#${name.slice(1)}`
      : DEFAULT_AVAILABLE_COLORS.find(known => known === name)
}

function parseColorScheme(value: unknown): ColorScheme | undefined {
  if (isRecord(value)) {
    const mainPalette = asPalette(value.mainPalette)
    const auxPalette = asPalette(value.auxPalette)
    if (mainPalette !== undefined && auxPalette !== undefined) {
      return {
        mainPalette,
        auxPalette,
        colorReadsByMappingQuality:
          asBoolean(value.colorReadsByMappingQuality) ?? false,
        alphaReadsByMappingQuality:
          asBoolean(value.alphaReadsByMappingQuality) ?? false,
      }
    }
  }
  return undefined
}

function parseTrack(value: unknown): Track | undefined {
  if (isRecord(value)) {
    const trackType = FILE_TYPES.find(known => known === value.trackType)
    if (trackType !== undefined) {
      return {
        trackType,
        trackFile: asString(value.trackFile),
        trackDisplayName: asString(value.trackDisplayName),
        trackColorSettings: parseColorScheme(value.trackColorSettings),
      }
    }
  }
  return undefined
}

// qs parses array-style params (tracks[0][...]=...) into { '0': …, '1': … },
// so accept both an object with numeric keys and a real array.
function parseTracks(value: unknown): Tracks | undefined {
  const entries =
    asArray(value) ??
    (isRecord(value)
      ? Object.keys(value)
          .sort((a, b) => Number(a) - Number(b))
          .map(key => value[key])
      : undefined)
  return entries
    ?.map(entry => parseTrack(entry))
    .filter((track): track is Track => track !== undefined)
}

// Parse a ViewTarget from the URL's query params. Returns null when the query
// carries something other than a saved view (e.g. analytics params) — callers
// default-fill rather than getting a half-populated target.
export function urlParamsToViewTarget(
  url: string | Location,
): ViewTarget | null {
  const query = new URL(url.toString()).search.slice(1)
  if (query) {
    const parsed = qs.parse(query)
    const region = asString(parsed.region)
    const tracks = parseTracks(parsed.tracks)
    if (region !== undefined && tracks !== undefined) {
      return {
        region,
        tracks,
        bedFile: asString(parsed.bedFile),
        name: asString(parsed.name),
        dataType: asString(parsed.dataType),
        simplify: asBoolean(parsed.simplify),
        removeSequences: asBoolean(parsed.removeSequences),
        skipAutoLoad: asBoolean(parsed.skipAutoLoad),
      }
    }
  }
  return null
}

// Serialize a ViewTarget into a URL-safe query string for the "copy link"
// feature. qs encodeValuesOnly=true keeps keys readable; see
// https://github.com/ljharb/qs#stringifying.
export function viewTargetToUrlParams(target: ViewTarget): string {
  return qs.stringify(target, { encodeValuesOnly: true })
}
