// Shared types used across the frontend.

// Possible track filetypes taken from the request.
// Files like GBZ contain graph and maybe haplotype and so can be either.
// Tabix-indexed TSV/BED needs a "node" and "graph" file pair to produce graph data.
export type FileType =
  | 'graph'
  | 'node'
  | 'haplotype'
  | 'read'
  | 'bed'
  | 'translation'

// The basic concept of a track.
export interface BaseTrack {
  trackFile?: string
  trackType: FileType
  // Human-readable label, e.g. the original filename for an upload. Optional
  // because URL/path-based trackFiles are already readable. The Legend and
  // other UI surfaces prefer this when present and fall back to trackFile.
  trackDisplayName?: string
}

// Represents a track available in an API.
export interface AvailableTrack extends BaseTrack {
  // If set, this track came from a preset or a pre-extracted region and is not
  // actually queryable on its own through the API for e.g. the list of paths
  // in it.
  trackIsImplied?: boolean
}

// Represents a track actually selected to be displayed.
export interface Track extends BaseTrack {
  trackColorSettings?: ColorScheme
}

// A collection of selected tracks to render a view with.
export type Tracks = Track[]

// Describes something the Tube Map can look at: a region and the files it
// is in. Extracted from defaults (config), HeaderForm input, or URL params.
export interface ViewTarget {
  region: string // Format: path:start-end
  tracks: Tracks
  bedFile?: string

  simplify?: boolean // Whether to write out small snarls
  removeSequences?: boolean // Whether to remove node sequences server-side

  // Non-essential to server, used for examples.
  name?: string

  // The HeaderForm tags view targets with the dataType used to build them.
  dataType?: string

  // Set true in config for data sources whose default region is large enough
  // that auto-loading on menu selection would be slow.
  skipAutoLoad?: boolean
}

// Per-region data stored as parallel arrays keyed by a region index.
// e.g. desc[4] is the description of the region whose chr/start/end are
// chr[4]/start[4]/end[4].
export interface RegionInfo {
  chr?: string[]
  // URL/directory for a pre-extracted cached chunk per region, or empty string.
  chunk?: string[]
  // Description of region from BED.
  desc?: string[]
  // Numerical string.
  end?: string[]
  // Numerical string.
  start?: string[]
  // Pre-defined tracks per region (or null when none).
  tracks?: (Track[] | null)[]
}

// Available built-in color palette names.
export type ColorPaletteName =
  | 'greys'
  | 'ygreys'
  | 'blues'
  | 'reds'
  | 'plainColors'
  | 'lightColors'

export const DEFAULT_AVAILABLE_COLORS: ColorPaletteName[] = [
  'greys',
  'ygreys',
  'blues',
  'reds',
  'plainColors',
  'lightColors',
]

// Hex describing a color.
export type ColorHex = `#${string}`

// A palette is either a known palette name or a custom hex color.
export type Palette = ColorPaletteName | ColorHex

// An object created by the React-Color library, contains information on the
// color selected. Has more properties than this, but only `hex` is consumed.
export interface ReactColor {
  hex: ColorHex
}

// Describes the coloring information for a track.
export interface ColorScheme {
  mainPalette: Palette
  auxPalette: Palette
  colorReadsByMappingQuality: boolean
  alphaReadsByMappingQuality: boolean
}

// Keys of ColorScheme whose values are Palette (not boolean).
export type PaletteField = {
  [K in keyof ColorScheme]: ColorScheme[K] extends Palette ? K : never
}[keyof ColorScheme]

// Stores the assigned color schemes of all tracks. Index `i` corresponds to
// the track at key `i` in [[Tracks]].
export type ColorSchemes = ColorScheme[]

// Visualization options state shared by App and the customization UI.
export interface VisOptions {
  removeRedundantNodes: boolean
  compressedView: boolean
  transparentNodes: boolean
  showNodeLabels: boolean
  showReads: boolean
  showSoftClips: boolean
  colorReadsByMappingQuality: boolean
  alphaReadsByMappingQuality: boolean
  colorSchemes: ColorSchemes
  mappingQualityCutoff: number
  // Sankey-style coarsened view: collapse per-read ribbons into one
  // edge-count-weighted band per node→node transition. Trades per-read detail
  // for the ability to browse much higher-coverage regions.
  coarsenedReadView: boolean
  // Treat forward and reverse strands as equivalent: normal reads stop using
  // the reverse-strand auxPalette, and the Sankey view merges (+A→+B) and
  // (-B→-A) into a single band. Useful when strand isn't relevant.
  ignoreStrand: boolean
}

// Keys of VisOptions that hold a boolean, i.e. the ones that can be toggled.
export type VisOptionFlag = {
  [K in keyof VisOptions]: VisOptions[K] extends boolean ? K : never
}[keyof VisOptions]

// A path entry returned by the API for a graph track.
export interface PathInfo {
  name: string
  // Offset of the path fragment along its contig; the region a whole-path
  // load asks for starts here rather than at 0.
  start?: number
  length: number | null
  cyclic: boolean
}

// Per-folder metadata read from a manifest.json in the mounted data path.
// Any field may be omitted; missing fields fall back to auto-detection from
// the files in the folder.
export interface FolderManifest {
  name?: string
  region?: string
  tracks?: Track[]
  bedFile?: string
  simplify?: boolean
  removeSequences?: boolean
}

// Shape returned by APIInterface.getFilenames().
export interface FilenamesResponse {
  files?: AvailableTrack[]
  bedFiles?: string[]
  // Map from folder client path (e.g. "exampleData/internal") to manifest.
  folderManifests?: Record<string, FolderManifest>
  error?: string
}
