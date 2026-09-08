import * as qs from 'qs'
import {
  DEFAULT_VIS_OPTIONS,
  VIS_OPTION_FLAGS,
  VIS_OPTION_KEYS,
  type StoredVisOptions,
} from './util/visOptions.ts'
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

// The same params are accepted in the fragment (`#?region=…`, or `#region=…`)
// as in the query string, so a view survives hosts and embedders that drop or
// rewrite query strings. The query wins when both carry a view. `#local`, the
// dev-mode backend switch, parses to a valueless key and is ignored here.
function parseUrlParams(url: string | Location) {
  const { search, hash } = new URL(url.toString())
  const query = search.slice(1)
  return qs.parse(query === '' ? hash.replace(/^#\??/, '') : query)
}

// Parse a ViewTarget from the URL's params. Returns null when the URL carries
// something other than a saved view (e.g. analytics params) — callers
// default-fill rather than getting a half-populated target.
export function urlParamsToViewTarget(
  url: string | Location,
): ViewTarget | null {
  const parsed = parseUrlParams(url)
  const region = asString(parsed.region)
  const tracks = parseTracks(parsed.tracks)
  return region !== undefined && tracks !== undefined
    ? {
        region,
        tracks,
        bedFile: asString(parsed.bedFile),
        name: asString(parsed.name),
        dataType: asString(parsed.dataType),
        simplify: asBoolean(parsed.simplify),
        removeSequences: asBoolean(parsed.removeSequences),
        skipAutoLoad: asBoolean(parsed.skipAutoLoad),
      }
    : null
}

// Parse the View menu settings out of `visOptions[...]` params. Every option
// is optional, so this returns the ones the URL actually names and leaves the
// rest to the stored preference.
export function urlParamsToVisOptions(
  url: string | Location,
): Partial<StoredVisOptions> {
  const value = parseUrlParams(url).visOptions
  if (isRecord(value)) {
    const flags: Partial<Record<(typeof VIS_OPTION_FLAGS)[number], boolean>> =
      {}
    for (const flag of VIS_OPTION_FLAGS) {
      const parsed = asBoolean(value[flag])
      if (parsed !== undefined) {
        flags[flag] = parsed
      }
    }
    const cutoff = Number(asString(value.mappingQualityCutoff))
    return {
      ...flags,
      ...(Number.isFinite(cutoff) &&
        cutoff >= 0 && { mappingQualityCutoff: cutoff }),
    }
  }
  return {}
}

// Only the options that differ from the defaults go in the URL, so a link to a
// plain view stays as short as it was before the View menu was linkable.
function changedVisOptions(visOptions: StoredVisOptions) {
  return Object.fromEntries(
    VIS_OPTION_KEYS.filter(
      key => visOptions[key] !== DEFAULT_VIS_OPTIONS[key],
    ).map(key => [key, visOptions[key]]),
  )
}

// Serialize a ViewTarget, and optionally the View menu settings, into a
// URL-safe query string for the "copy link" feature. qs encodeValuesOnly=true
// keeps keys readable; see https://github.com/ljharb/qs#stringifying.
export function viewTargetToUrlParams(
  target: ViewTarget,
  visOptions?: StoredVisOptions,
): string {
  const changed = visOptions === undefined ? {} : changedVisOptions(visOptions)
  return qs.stringify(
    {
      ...target,
      ...(Object.keys(changed).length > 0 && { visOptions: changed }),
    },
    { encodeValuesOnly: true },
  )
}
