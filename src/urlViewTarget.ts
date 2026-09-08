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

// `bed` is deliberately absent: a BED goes in `bedFile`, never in `tracks`,
// and defaultTrackColors() throws for it, so accepting it here let a crafted
// URL crash the first render.
const TRACK_TYPES = [
  'graph',
  'node',
  'haplotype',
  'read',
  'translation',
] as const satisfies readonly FileType[]

// The params a saved view owns. Anything else in the URL belongs to whoever
// put it there (analytics, the `#local` dev flag) and is left alone.
const VIEW_PARAM_KEYS = [
  'region',
  'tracks',
  'bedFile',
  'name',
  'dataType',
  'simplify',
  'removeSequences',
  'skipAutoLoad',
  'visOptions',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

// A query string has no types, so every boolean arrives as a string and has
// to be coerced back.
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
    const trackType = TRACK_TYPES.find(known => known === value.trackType)
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

// `parseArrays: false` in parseUrlParams makes qs hand back `tracks[0][…]` as
// `{ '0': … }` every time. Left to itself qs switches between an array and
// that object at `arrayLimit` (20 tracks), which meant supporting both shapes.
//
// An empty `tracks=` is a view with no tracks selected, which is a state the
// app can be in and so has to survive a reload.
function parseTracks(value: unknown): Tracks | undefined {
  return value === ''
    ? []
    : isRecord(value)
      ? Object.keys(value)
          .sort((a, b) => Number(a) - Number(b))
          .map(key => parseTrack(value[key]))
          .filter((track): track is Track => track !== undefined)
      : undefined
}

// The same params are accepted in the fragment (`#?region=…`, or `#region=…`)
// as in the query string, so a view survives hosts and embedders that drop or
// rewrite query strings. The two are merged rather than one winning outright:
// a mailer or analytics redirect that appends `?utm_source=…` to a
// fragment-encoded link must not destroy the view it carries. Where both name
// the same param the query wins. `#local`, the dev-mode backend switch, parses
// to a valueless key and is ignored here.
function parseUrlParams(url: string | Location) {
  const { search, hash } = new URL(url.toString())
  const parse = (input: string) => qs.parse(input, { parseArrays: false })
  return {
    ...parse(hash.replace(/^#\??/, '')),
    ...parse(search.slice(1)),
  }
}

// Strip a view out of a fragment, keeping whatever else it carries. Writing
// the query without this leaves the fragment describing an older view, which
// is invisible locally (the query wins) but is the whole view for an embedder
// that keeps only the fragment. Operates on the raw text so valueless flags
// stay valueless: `#local` has to survive as `local`, not `local=`.
export function fragmentWithoutView(hash: string) {
  return hash
    .replace(/^#\??/, '')
    .split('&')
    .filter(part => part !== '')
    .filter(
      part => !VIEW_PARAM_KEYS.includes(decodeURIComponent(part).split(/[=[]/)[0]!),
    )
    .join('&')
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
      // qs drops an empty array, which would make a no-tracks view parse back
      // as "no view at all". An empty string round trips through parseTracks.
      ...(target.tracks.length === 0 && { tracks: '' }),
      ...(Object.keys(changed).length > 0 && { visOptions: changed }),
    },
    { encodeValuesOnly: true },
  )
}
