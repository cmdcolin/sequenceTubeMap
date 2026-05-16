import { useEffect } from 'react'
import * as tubeMap from '../util/tubemap'
import type { VisOptions } from '../Types'

interface TubeMapInternalOptions extends VisOptions {
  coloredNodes?: unknown
  focusReadNames?: unknown
  readGroups?: unknown
  otherReadsColor?: unknown
}

function updateVisOptions(visOptions: TubeMapInternalOptions, nodeSequences: boolean) {
  if (nodeSequences) {
    visOptions.compressedView
      ? tubeMap.setNodeWidthOption('compressed')
      : tubeMap.setNodeWidthOption('normal')
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

  for (const key of Object.keys(visOptions.colorSchemes)) {
    tubeMap.setColorSet(key, {
      ...visOptions.colorSchemes[Number(key)],
      colorReadsByMappingQuality: visOptions.colorReadsByMappingQuality,
      alphaReadsByMappingQuality: visOptions.alphaReadsByMappingQuality,
    })
  }
  tubeMap.setMappingQualityCutoff(visOptions.mappingQualityCutoff)
  tubeMap.setFocusReadNames(visOptions.focusReadNames)
  tubeMap.setReadGroups(visOptions.readGroups)
  tubeMap.setOtherReadsColor(visOptions.otherReadsColor)
}

interface TubeMapProps {
  nodes: unknown
  tracks: unknown
  reads: unknown
  region: unknown
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
    tubeMap.create({ svgID: '#svg', nodes, tracks, reads, region, visOptions })
  }, [nodes, tracks, reads, region, visOptions, nodeSequences])

  return <svg id="svg" aria-label="Rendered sequence tube map visualization" />
}

export default TubeMap
