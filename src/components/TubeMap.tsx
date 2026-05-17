import { useEffect } from 'react'
import * as tubeMap from '../util/tubemap'
import type {
  InputNode,
  InputTrack,
  InputRegion,
  ReadGroup as TubeMapReadGroup,
} from '../util/tubemap'
import type { VisOptions } from '../Types'

interface ReadGroupInput {
  color: string
  reads: string[] | Set<string>
}

interface TubeMapInternalOptions extends VisOptions {
  coloredNodes?: string[]
  focusReadNames?: string[] | null
  readGroups?: (ReadGroupInput | TubeMapReadGroup)[]
  otherReadsColor?: string
}

function updateVisOptions(
  visOptions: TubeMapInternalOptions,
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
  tubeMap.setColoredNodes(visOptions.coloredNodes)
  tubeMap.setShowNodeLabels(visOptions.showNodeLabels)
  tubeMap.setNodeLabelColorScheme(visOptions.nodeLabelColorScheme)

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

interface TubeMapProps {
  nodes: InputNode[]
  tracks: InputTrack[]
  reads?: InputTrack[] | null
  region?: InputRegion
  visOptions: TubeMapInternalOptions
  nodeSequences?: boolean
}

function TubeMap({
  nodes,
  tracks,
  reads,
  region,
  visOptions,
  nodeSequences = true,
}: TubeMapProps) {
  useEffect(() => {
    updateVisOptions(visOptions, nodeSequences)
    tubeMap.create({ svgID: '#svg', nodes, tracks, reads, region })
  }, [nodes, tracks, reads, region, visOptions, nodeSequences])

  return <svg id="svg" aria-label="Rendered sequence tube map visualization" />
}

export default TubeMap
