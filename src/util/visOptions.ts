// The single place that translates VisOptions into tubemap.ts's renderer
// config. TubeMap.tsx applies it on every render; the headless CLI applies it
// once. Keeping it here is what stops the CLI from quietly depending on
// tubemap's module-level defaults happening to match the app's.

import * as tubeMap from './tubemap.ts'
import type { ReadGroup as TubeMapReadGroup } from './tubemap.ts'
import { dataOriginTypes } from '../enums.ts'
import type { ColorScheme, VisOptions, VisOptionFlag } from '../Types.ts'

interface ReadGroupInput {
  color: string
  reads: string[] | Set<string>
}

// VisOptions plus the per-render extras TubeMapContainer layers on top; none
// of them are persisted, so they aren't part of VisOptions itself.
export interface TubeMapVisOptions extends VisOptions {
  coloredNodes?: string[]
  focusReadNames?: string[] | null
  readGroups?: (ReadGroupInput | TubeMapReadGroup)[]
  otherReadsColor?: string
}

// Everything in VisOptions except the color schemes, which are derived from
// the loaded tracks and so can't be meaningfully restored on their own.
export type StoredVisOptions = Omit<VisOptions, 'colorSchemes'>

export const VIS_OPTION_FLAGS = [
  'removeRedundantNodes',
  'compressedView',
  'transparentNodes',
  'showNodeLabels',
  'showReads',
  'showSoftClips',
  'colorReadsByMappingQuality',
  'alphaReadsByMappingQuality',
  'coarsenedReadView',
  'ignoreStrand',
] as const satisfies readonly VisOptionFlag[]

export const VIS_OPTION_KEYS = [
  ...VIS_OPTION_FLAGS,
  'mappingQualityCutoff',
] as const satisfies readonly (keyof StoredVisOptions)[]

export const DEFAULT_VIS_OPTIONS: StoredVisOptions = {
  removeRedundantNodes: true,
  compressedView: false,
  transparentNodes: false,
  showNodeLabels: false,
  showReads: true,
  showSoftClips: true,
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
  mappingQualityCutoff: 0,
  coarsenedReadView: false,
  ignoreStrand: false,
}

// The bundled demo datasets carry no track settings to derive colors from, so
// name them here rather than let each caller fall back to something different:
// the app used to color an example with whatever the last loaded data source
// left in visOptions, and the CLI with tubemap's own type defaults.
//
// A haplotype takes its color from `auxPalette` — `mainPalette` only supplies
// the reference path's — so it is the aux one that sets the look. The
// alignment examples mute the graph to greys so the reads read clearly over
// it; the rest are structural, and their haplotypes are the subject.
const MUTED_GRAPH: ColorScheme = {
  mainPalette: 'greys',
  auxPalette: 'greys',
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
}

const CATEGORICAL_GRAPH: ColorScheme = {
  mainPalette: 'plainColors',
  auxPalette: 'lightColors',
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
}

// Forward reads from the main palette, reverse ones from the aux: the pair the
// app's own config ships as the read default.
const EXAMPLE_READS: ColorScheme = {
  mainPalette: 'blues',
  auxPalette: 'reds',
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
}

const EXAMPLE_GRAPH_SCHEMES: Record<string, ColorScheme> = {
  [dataOriginTypes.EXAMPLE_6]: MUTED_GRAPH,
  [dataOriginTypes.EXAMPLE_7]: MUTED_GRAPH,
}

// Indexed the way an example's tracks are: the graph first, its reads second.
// The reads keep the standard forward/reverse pair — example 7 is about
// reverse alignments, and one palette for both strands would hide them.
// Examples with no reads name the pair anyway, so the legend describes the
// same colors the renderer would reach for.
export function exampleColorSchemes(dataOrigin: string): ColorScheme[] {
  return [
    EXAMPLE_GRAPH_SCHEMES[dataOrigin] ?? CATEGORICAL_GRAPH,
    EXAMPLE_READS,
  ]
}

// `nodeSequences` is false when the backend stripped node sequences, which
// leaves nothing to scale node widths by.
export function applyVisOptions(
  visOptions: TubeMapVisOptions,
  nodeSequences: boolean,
) {
  if (nodeSequences) {
    if (visOptions.compressedView) {
      tubeMap.setNodeWidthOption('compressed')
    } else {
      tubeMap.setNodeWidthOption('normal')
    }
  } else {
    tubeMap.setNodeWidthOption('fixed')
  }
  tubeMap.setMergeNodesFlag(visOptions.removeRedundantNodes)
  tubeMap.setTransparentNodesFlag(visOptions.transparentNodes)
  tubeMap.setShowReadsFlag(visOptions.showReads)
  tubeMap.setSoftClipsFlag(visOptions.showSoftClips)
  tubeMap.setCoarsenedReadViewFlag(visOptions.coarsenedReadView)
  tubeMap.setIgnoreStrandFlag(visOptions.ignoreStrand)
  tubeMap.setColoredNodes(visOptions.coloredNodes)
  tubeMap.setShowNodeLabels(visOptions.showNodeLabels)

  visOptions.colorSchemes.forEach((scheme, idx) => {
    tubeMap.setColorSet(idx, {
      mainPalette: scheme.mainPalette,
      auxPalette: scheme.auxPalette,
      colorReadsByMappingQuality: visOptions.colorReadsByMappingQuality,
      alphaReadsByMappingQuality: visOptions.alphaReadsByMappingQuality,
    })
  })
  tubeMap.setMappingQualityCutoff(visOptions.mappingQualityCutoff)
  tubeMap.setFocusReadNames(visOptions.focusReadNames)
  tubeMap.setReadGroups(visOptions.readGroups)
  tubeMap.setOtherReadsColor(visOptions.otherReadsColor)
}
