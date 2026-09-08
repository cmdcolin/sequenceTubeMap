import {
  DEFAULT_VIS_OPTIONS,
  VIS_OPTION_FLAGS,
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

// Extensions the `tracks=` short form infers a type from when a link omits the
// `type:` prefix. Ordered, first match wins: a .gbz carries a graph and maybe
// haplotypes, so it reads as a graph unless a link says `haplotype:` outright.
//
// Deliberately separate from uploadFileTypes.ts, which encodes what the upload
// dialog will accept rather than what a track can be -- it excludes .gaf.gz
// because the upload route cannot index one, though a mounted .gaf.gz is a
// perfectly good read track. Tying the URL format to that list would let a
// change to the file picker silently redefine published links.
const TRACK_TYPE_EXTENSIONS: readonly (readonly [FileType, readonly string[]])[] =
  [
    ['graph', ['.xg', '.vg', '.hg', '.pg', '.gbz.db', '.gbz', '.db']],
    ['read', ['.gam', '.gaf.gz', '.gaf']],
    ['haplotype', ['.gbwt']],
    ['translation', ['.tsv', '.trans']],
  ]

// The params a saved view owns. Anything else in the URL belongs to whoever
// put it there (analytics, the `#local` dev flag) and is left alone.
const VIEW_PARAM_KEYS = [
  'region',
  'tracks',
  'tracksJson',
  'colors',
  'vis',
  'mapq',
  'bedFile',
  'name',
  'dataType',
  'simplify',
  'removeSequences',
  'skipAutoLoad',
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
  return value === 'true' ? true : value === 'false' ? false : undefined
}

// Runs at module scope on whatever URL the user arrived with, so a malformed
// escape has to degrade rather than throw.
function decodeParam(raw: string) {
  const spaced = raw.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(spaced)
  } catch {
    return spaced
  }
}

// encodeURIComponent escapes more than a query value needs. Put `:` and `/`
// back so regions and paths stay readable. `#` stays escaped: PanSN path names
// contain one and a raw `#` would start the fragment. `,` stays escaped too,
// which is what lets a comma inside a filename survive a comma-separated list.
function encodeParam(value: string) {
  return encodeURIComponent(value).replace(/%3A/g, ':').replace(/%2F/g, '/')
}

function scalarParam(key: string, value: string) {
  return `${key}=${encodeParam(value)}`
}

function listParam(key: string, values: readonly string[]) {
  return `${key}=${values.map(encodeParam).join(',')}`
}

// Values stay raw so a list can be split on its separators before its elements
// are decoded, which is the only way `%2C` in a filename survives.
function readRawParams(input: string) {
  const params = new Map<string, string>()
  for (const part of input.split('&')) {
    if (part !== '') {
      const separator = part.indexOf('=')
      const key = separator === -1 ? part : part.slice(0, separator)
      params.set(decodeParam(key), separator === -1 ? '' : part.slice(separator + 1))
    }
  }
  return params
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
  return new Map([
    ...readRawParams(hash.replace(/^#\??/, '')),
    ...readRawParams(search.slice(1)),
  ])
}

function readScalar(params: Map<string, string>, key: string) {
  const raw = params.get(key)
  return raw === undefined ? undefined : decodeParam(raw)
}

function readList(params: Map<string, string>, key: string) {
  const raw = params.get(key)
  return raw === undefined
    ? undefined
    : raw === ''
      ? []
      : raw.split(',').map(decodeParam)
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
      part =>
        !VIEW_PARAM_KEYS.includes(decodeParam(part).split(/[=[]/)[0]!),
    )
    .join('&')
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
        colorReadsByMappingQuality: value.colorReadsByMappingQuality === true,
        alphaReadsByMappingQuality: value.alphaReadsByMappingQuality === true,
      }
    }
  }
  return undefined
}

function parseTrackObject(value: unknown): Track | undefined {
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

function inferTrackType(trackFile: string) {
  // A hosted graph often arrives as a presigned URL, so the extension has to
  // be read from the path rather than the whole string.
  const path = trackFile.split(/[?#]/)[0]!.toLowerCase()
  return TRACK_TYPE_EXTENSIONS.find(([, extensions]) =>
    extensions.some(extension => path.endsWith(extension)),
  )?.[0]
}

// One entry of the `tracks=` short form: `graph:path.gbz.db`, or just
// `path.gbz.db` to let the extension decide.
function parseShortTrack(entry: string): Track | undefined {
  const separator = entry.indexOf(':')
  const named = TRACK_TYPES.find(known => known === entry.slice(0, separator))
  const trackFile = named === undefined ? entry : entry.slice(separator + 1)
  const trackType = named ?? inferTrackType(trackFile)
  return trackType === undefined ? undefined : { trackType, trackFile }
}

// `colors=greys/ygreys,,plainColors/lightColors` -- one entry per track,
// positionally, empty where a track takes its type's default.
function applyShortColors(tracks: Tracks, colors: string[] | undefined): Tracks {
  return colors === undefined
    ? tracks
    : tracks.map((track, index) => {
        const [mainPalette, auxPalette] = (colors[index] ?? '').split('/')
        const scheme = parseColorScheme({ mainPalette, auxPalette })
        return scheme === undefined
          ? track
          : { ...track, trackColorSettings: scheme }
      })
}

function parseJsonTracks(value: string): Tracks | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed
          .map(entry => parseTrackObject(entry))
          .filter((track): track is Track => track !== undefined)
      : undefined
  } catch {
    return undefined
  }
}

function parseTracks(params: Map<string, string>): Tracks | undefined {
  const json = readScalar(params, 'tracksJson')
  const short = readList(params, 'tracks')
  return json !== undefined
    ? parseJsonTracks(json)
    : short === undefined
      ? undefined
      : applyShortColors(
          short
            .map(entry => parseShortTrack(entry))
            .filter((track): track is Track => track !== undefined),
          readList(params, 'colors'),
        )
}

// Everything a link can say about a view apart from its tracks. Split out so
// a `name=`-resolved data source can be overridden by the params beside it.
function parseViewFields(params: Map<string, string>) {
  const region = readScalar(params, 'region')
  const bedFile = readScalar(params, 'bedFile')
  const dataType = readScalar(params, 'dataType')
  const simplify = asBoolean(readScalar(params, 'simplify'))
  const removeSequences = asBoolean(readScalar(params, 'removeSequences'))
  return {
    ...(region !== undefined && { region }),
    ...(bedFile !== undefined && { bedFile }),
    ...(dataType !== undefined && { dataType }),
    ...(simplify !== undefined && { simplify }),
    ...(removeSequences !== undefined && { removeSequences }),
  }
}

// Parse a ViewTarget from the URL's params. Returns null when the URL carries
// something other than a saved view (e.g. analytics params) -- callers
// default-fill rather than getting a half-populated target.
//
// A link that names no tracks but whose `name=` matches a configured data
// source is that data source, with any params beside it layered on top:
// `?name=snp1kg-BRCA1&region=17:1-1000` rather than the source's files spelled
// out again. Passing `dataSources` is what enables that; a name that matches
// nothing there stays unresolved, so the caller still default-fills rather
// than silently rendering someone else's data under the requested name.
export function urlParamsToViewTarget(
  url: string | Location,
  dataSources: readonly ViewTarget[] = [],
): ViewTarget | null {
  const params = parseUrlParams(url)
  const tracks = parseTracks(params)
  const fields = parseViewFields(params)
  const name = readScalar(params, 'name')
  const named =
    tracks === undefined
      ? dataSources.find(source => source.name === name)
      : undefined
  return named !== undefined
    ? { ...named, ...fields }
    : tracks !== undefined && fields.region !== undefined
      ? { ...fields, region: fields.region, tracks, name }
      : null
}

// Parse the View menu settings out of the URL. Every option is optional, so
// this returns the ones the URL actually names and leaves the rest to the
// stored preference.
export function urlParamsToVisOptions(
  url: string | Location,
): Partial<StoredVisOptions> {
  const params = parseUrlParams(url)
  const flags: Partial<Record<(typeof VIS_OPTION_FLAGS)[number], boolean>> = {}

  // `vis=compressedView,-showReads`: named to turn on, `-` prefixed to turn
  // off. Later entries win, so a list that names one flag twice is not an
  // error.
  for (const entry of readList(params, 'vis') ?? []) {
    const enabled = !entry.startsWith('-')
    const flag = VIS_OPTION_FLAGS.find(
      known => known === (enabled ? entry : entry.slice(1)),
    )
    if (flag !== undefined) {
      flags[flag] = enabled
    }
  }

  const cutoff = Number(readScalar(params, 'mapq'))
  return {
    ...flags,
    ...(Number.isFinite(cutoff) &&
      cutoff >= 0 && { mappingQualityCutoff: cutoff }),
  }
}

// The short `tracks=`/`colors=` form cannot say everything a Track can: a
// track resolved from a BED has no path to list, an uploaded one carries a
// display name, and a color scheme can carry the per-track mapping-quality
// flags. Those views fall back to `tracksJson=`, which is the whole array.
function isShortFormTrack(track: Track) {
  const colors = track.trackColorSettings
  return (
    track.trackFile !== undefined &&
    track.trackFile !== '' &&
    !track.trackFile.includes(',') &&
    track.trackDisplayName === undefined &&
    (colors === undefined ||
      (!colors.colorReadsByMappingQuality && !colors.alphaReadsByMappingQuality))
  )
}

function tracksToParams(tracks: Tracks) {
  const short = tracks.every(track => isShortFormTrack(track))
  const colors = tracks.map(track =>
    track.trackColorSettings === undefined
      ? ''
      : `${track.trackColorSettings.mainPalette}/${track.trackColorSettings.auxPalette}`,
  )
  return short
    ? [
        listParam(
          'tracks',
          tracks.map(track => `${track.trackType}:${track.trackFile!}`),
        ),
        ...(colors.some(entry => entry !== '') ? [listParam('colors', colors)] : []),
      ]
    : [scalarParam('tracksJson', JSON.stringify(tracks))]
}

function visOptionsToParams(visOptions: StoredVisOptions) {
  const flags = VIS_OPTION_FLAGS.filter(
    flag => visOptions[flag] !== DEFAULT_VIS_OPTIONS[flag],
  ).map(flag => (visOptions[flag] ? flag : `-${flag}`))
  return [
    ...(flags.length > 0 ? [listParam('vis', flags)] : []),
    ...(visOptions.mappingQualityCutoff !==
    DEFAULT_VIS_OPTIONS.mappingQualityCutoff
      ? [scalarParam('mapq', String(visOptions.mappingQualityCutoff))]
      : []),
  ]
}

// Serialize a ViewTarget, and optionally the View menu settings, into a
// URL-safe query string for the "copy link" feature.
//
// Only what differs from a default is written. `simplify` and
// `removeSequences` are false in nearly every view and the app treats false
// and absent alike, so writing them put 38 characters of nothing in every
// link. `skipAutoLoad` is read off the configured data source rather than off
// a ViewTarget, so a link never had a use for it at all.
export function viewTargetToUrlParams(
  target: ViewTarget,
  visOptions?: StoredVisOptions,
): string {
  return [
    scalarParam('region', target.region),
    ...tracksToParams(target.tracks),
    ...(target.bedFile === undefined ? [] : [scalarParam('bedFile', target.bedFile)]),
    ...(target.name === undefined ? [] : [scalarParam('name', target.name)]),
    ...(target.dataType === undefined
      ? []
      : [scalarParam('dataType', target.dataType)]),
    ...(target.simplify === true ? [scalarParam('simplify', 'true')] : []),
    ...(target.removeSequences === true
      ? [scalarParam('removeSequences', 'true')]
      : []),
    ...(visOptions === undefined ? [] : visOptionsToParams(visOptions)),
  ].join('&')
}
