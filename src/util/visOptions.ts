// The single place that translates VisOptions into tubemap.ts's renderer
// config. TubeMap.tsx applies it on every render; the headless CLI applies it
// once. Keeping it here is what stops the CLI from quietly depending on
// tubemap's module-level defaults happening to match the app's.

import * as tubeMap from './tubemap.ts'
import type { ReadGroup as TubeMapReadGroup } from './tubemap.ts'
import type { VisOptions, VisOptionFlag } from '../Types.ts'

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
