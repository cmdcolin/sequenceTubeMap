import { useEffect } from 'react'
import * as tubeMap from '../util/tubemap.ts'
import type { InputNode, InputTrack, InputRegion } from '../util/tubemap.ts'
import { applyVisOptions, type TubeMapVisOptions } from '../util/visOptions.ts'
import type { FoldView } from '../util/foldVariants.ts'

interface TubeMapProps {
  nodes: InputNode[]
  tracks: InputTrack[]
  reads?: InputTrack[] | null
  region?: InputRegion
  fold?: FoldView
  visOptions: TubeMapVisOptions
  nodeSequences?: boolean
}

function TubeMap({
  nodes,
  tracks,
  reads,
  region,
  fold,
  visOptions,
  nodeSequences = true,
}: TubeMapProps) {
  useEffect(() => {
    applyVisOptions(visOptions, nodeSequences)
    tubeMap.create({ svgID: '#svg', nodes, tracks, reads, region, fold })
    return tubeMap.releaseDomBindings
  }, [nodes, tracks, reads, region, fold, visOptions, nodeSequences])

  // On unmount only, since a redraw of the same data keeps the hidden tracks,
  // track order and viewport
  useEffect(() => tubeMap.forgetDataset, [])

  return <svg id="svg" aria-label="Rendered sequence tube map visualization" />
}

export default TubeMap
