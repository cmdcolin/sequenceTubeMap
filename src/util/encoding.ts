// The aesthetic mapping: which scale each mark's color and opacity come from,
// laid out as one table. The renderer reads a drawn track's channels off it,
// and the legend reads the rows keying each loaded file off the same entries,
// so the key can't disagree with the picture.
import { isCoarsenedId } from '@jbrowse/tubemap-core'
import type { ColorableTrack } from '@jbrowse/tubemap-core'
import {
  type AlphaScale,
  type ColorScale,
  type DrawnTrack,
  type Mark,
  mappingQualityAlphaScale,
  mappingQualityColorScale,
  pathScale,
  type ReadGroupColor,
  readGroupScale,
  referenceScale,
  type Scheme,
  shareScale,
  strandScale,
} from './scales.ts'

export type { DrawnTrack, Mark } from './scales.ts'

// The variable a read's color shows, and the one its opacity shows
export interface ReadEncoding {
  color: 'group' | 'mapq' | 'strand'
  alpha?: 'mapq'
}

// The view's coloring: which variables encode a read, and what the scales take
export interface Coloring {
  read: ReadEncoding
  readGroups?: readonly ReadGroupColor[]
  otherReadsColor?: string
  ignoreStrand?: boolean
}

// The View menu's read flags, as visOptions and the vis= URL parameter carry them
export interface ReadColoringFlags {
  readGroups?: readonly unknown[]
  colorReadsByMappingQuality?: boolean
  alphaReadsByMappingQuality?: boolean
}

// Named read groups win while any exists, then mapping quality, then strand
export function readEncodingFrom(flags: ReadColoringFlags): ReadEncoding {
  return {
    color:
      (flags.readGroups?.length ?? 0) > 0
        ? 'group'
        : flags.colorReadsByMappingQuality
          ? 'mapq'
          : 'strand',
    ...(flags.alphaReadsByMappingQuality ? { alpha: 'mapq' } : {}),
  }
}

// A read group as the renderer holds it, with the reads that belong to it
export interface ReadGroupMembers extends ReadGroupColor {
  reads?: ReadonlySet<string>
}

// The reference is whichever track sits first in the input, which
// moveTrackToFirstPosition can change.
export function markOf(
  track: ColorableTrack,
  referenceId: number | undefined,
): Mark {
  if (track.haplotypeShare !== undefined) {
    return 'haplotypeBand'
  } else if (isCoarsenedId(track.id)) {
    return 'readBand'
  } else if (track.type === 'read') {
    return 'read'
  } else {
    return track.id === referenceId ? 'reference' : 'path'
  }
}

// Last group wins on overlap
function groupOf(
  name: string | undefined,
  groups: readonly ReadGroupMembers[],
): number | undefined {
  if (name === undefined) {
    return undefined
  }
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]!.reads?.has(name)) {
      return i
    }
  }
  return undefined
}

// The layout's track, projected onto what the scales read
export function drawnTrack(
  track: ColorableTrack,
  referenceId: number | undefined,
  groups: readonly ReadGroupMembers[],
): DrawnTrack {
  const mark = markOf(track, referenceId)
  const group = mark === 'read' ? groupOf(track.name, groups) : undefined
  return {
    mark,
    source: track.sourceTrackID,
    id: track.id,
    reverse: track.is_reverse === true,
    ...(track.name === undefined ? {} : { name: track.name }),
    ...(track.mapping_quality === undefined
      ? {}
      : { mappingQuality: track.mapping_quality }),
    ...(group === undefined ? {} : { group }),
    ...(track.haplotypeShare === undefined
      ? {}
      : { share: track.haplotypeShare }),
  }
}

// The channels one mark is drawn through: opacity only where something sets it
export interface Aesthetics {
  color: ColorScale
  alpha?: AlphaScale
}

export type Encoding = Record<Mark, Aesthetics>

function readColorScale(coloring: Coloring, strand: ColorScale): ColorScale {
  switch (coloring.read.color) {
    case 'group':
      return readGroupScale(
        coloring.readGroups ?? [],
        coloring.otherReadsColor ?? 'greys',
      )
    case 'mapq':
      return mappingQualityColorScale
    case 'strand':
      return strand
  }
}

// What each mark is drawn with, under one file's scheme and the view's
// coloring. A band stands for many reads or haplotypes, so a read group or a
// mapping quality, which belong to one read, don't color it: a haplotype band
// takes its share of the haplotypes, a read band its strand.
export function encodingFor(scheme: Scheme, coloring: Coloring): Encoding {
  const ignoreStrand = coloring.ignoreStrand ?? false
  const strand = strandScale(scheme, ignoreStrand)
  return {
    reference: { color: referenceScale(scheme) },
    path: { color: pathScale(scheme) },
    read: {
      color: readColorScale(coloring, strand),
      ...(coloring.read.alpha === 'mapq'
        ? { alpha: mappingQualityAlphaScale }
        : {}),
    },
    readBand: { color: strand },
    haplotypeBand: { color: shareScale(ignoreStrand) },
  }
}
