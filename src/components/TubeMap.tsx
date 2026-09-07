import { useEffect } from 'react'
import * as tubeMap from '../util/tubemap.ts'
import type { InputNode, InputTrack, InputRegion } from '../util/tubemap.ts'
import { applyVisOptions, type TubeMapVisOptions } from '../util/visOptions.ts'

interface TubeMapProps {
  nodes: InputNode[]
  tracks: InputTrack[]
  reads?: InputTrack[] | null
  region?: InputRegion
  visOptions: TubeMapVisOptions
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
    applyVisOptions(visOptions, nodeSequences)
    tubeMap.create({ svgID: '#svg', nodes, tracks, reads, region })
  }, [nodes, tracks, reads, region, visOptions, nodeSequences])

  return <svg id="svg" aria-label="Rendered sequence tube map visualization" />
}

export default TubeMap
