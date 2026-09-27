// Which scale colors which mark, in one place. The renderer asks it for each
// drawn track's color and opacity, and the legend asks it for the rows keying
// each loaded file, so the key can't disagree with the picture.
import { isCoarsenedId } from '@gmod/tubemap-core'
import type { ColorableTrack } from '@gmod/tubemap-core'
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

export interface Coloring {
  // Named read groups override every other read coloring while any exists
  readGroups?: readonly ReadGroupColor[]
  otherReadsColor?: string
  ignoreStrand?: boolean
  colorReadsByMappingQuality?: boolean
  alphaReadsByMappingQuality?: boolean
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

// A band stands for many reads or haplotypes, so a read group or a mapping
// quality, which belong to one read, don't color it: a haplotype band takes
// its share of the haplotypes, a read band its strand. A read takes its group,
// else its mapping quality, else its strand. Undefined where the scale needs
// a scheme and there is none.
export function colorScaleFor(
  mark: Mark,
  scheme: Scheme,
  coloring: Coloring,
): ColorScale
export function colorScaleFor(
  mark: Mark,
  scheme: Scheme | undefined,
  coloring: Coloring,
): ColorScale | undefined
export function colorScaleFor(
  mark: Mark,
  scheme: Scheme | undefined,
  coloring: Coloring,
): ColorScale | undefined {
  const ignoreStrand = coloring.ignoreStrand ?? false
  const readGroups = coloring.readGroups ?? []
  switch (mark) {
    case 'haplotypeBand':
      return shareScale(ignoreStrand)
    case 'readBand':
      return scheme && strandScale(scheme, ignoreStrand)
    case 'read':
      return readGroups.length > 0
        ? readGroupScale(readGroups, coloring.otherReadsColor ?? 'greys')
        : coloring.colorReadsByMappingQuality
          ? mappingQualityColorScale
          : scheme && strandScale(scheme, ignoreStrand)
    case 'reference':
      return scheme && referenceScale(scheme)
    case 'path':
      return scheme && pathScale(scheme)
  }
}

// Opacity is a channel of its own, under whichever scale colors a read
export function alphaScaleFor(
  mark: Mark,
  coloring: Coloring,
): AlphaScale | undefined {
  return mark === 'read' && coloring.alphaReadsByMappingQuality
    ? mappingQualityAlphaScale
    : undefined
}
