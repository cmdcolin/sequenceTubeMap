// Which scale colors which tracks, in one place. The renderer asks it for
// each drawn track's color and opacity, and the legend asks it for the rows
// keying each loaded file, so the key can't disagree with the picture.
import { isCoarsenedId } from '@gmod/tubemap-core'
import type { ColorableTrack, Coarsening } from '@gmod/tubemap-core'
import type { FileType } from '../Types.ts'
import {
  type AlphaScale,
  type ColorScale,
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

// What a drawn track is, as far as coloring goes
export type Mark = 'reference' | 'path' | 'read' | 'readBand' | 'haplotypeBand'

export interface Coloring {
  // Named read groups override every other read coloring while any exists
  readGroups?: readonly ReadGroupColor[]
  otherReadsColor?: string
  ignoreStrand?: boolean
  colorReadsByMappingQuality?: boolean
  alphaReadsByMappingQuality?: boolean
  // What the layout drew as bands, for the key; drawn tracks carry their own
  coarsened?: Coarsening | undefined
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

export interface FileMark {
  mark: Mark
  noun: string
}

// What a loaded file draws, or undefined for one that draws no tracks of its
// own. With a haplotype file loaded, the paths beside the reference are its
// tracks rather than the graph's.
export function fileMarks(
  type: FileType,
  coloring: Coloring,
  hasHaplotype: boolean,
): FileMark[] | undefined {
  const others: FileMark =
    coloring.coarsened?.unit === 'haplotype'
      ? { mark: 'haplotypeBand', noun: 'bands' }
      : {
          mark: 'path',
          noun: type === 'graph' ? 'other paths' : 'haplotypes',
        }
  if (type === 'read') {
    return coloring.coarsened?.unit === 'read'
      ? [{ mark: 'readBand', noun: 'read bands' }]
      : [{ mark: 'read', noun: 'reads' }]
  } else if (type === 'graph') {
    return [
      { mark: 'reference', noun: 'reference path' },
      ...(hasHaplotype ? [] : [others]),
    ]
  } else if (type === 'haplotype') {
    return [others]
  } else {
    return undefined
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
      return shareScale(coloring.coarsened, ignoreStrand)
    case 'readBand':
      return (
        scheme &&
        strandScale(
          scheme,
          ignoreStrand,
          coloring.coarsened?.reverse ?? !ignoreStrand,
        )
      )
    case 'read':
      return readGroups.length > 0
        ? readGroupScale(readGroups, coloring.otherReadsColor ?? 'greys')
        : coloring.colorReadsByMappingQuality
          ? mappingQualityColorScale
          : scheme && strandScale(scheme, ignoreStrand, !ignoreStrand)
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
