import { useEffect } from "react";
import * as tubeMap from "../util/tubemap";

function updateVisOptions(visOptions, nodeSequences) {
  if (nodeSequences) {
    visOptions.compressedView
      ? tubeMap.setNodeWidthOption("compressed")
      : tubeMap.setNodeWidthOption("normal");
  } else {
    tubeMap.setNodeWidthOption("fixed");
  }
  tubeMap.setMergeNodesFlag(visOptions.removeRedundantNodes);
  tubeMap.setTransparentNodesFlag(visOptions.transparentNodes);
  tubeMap.setShowReadsFlag(visOptions.showReads);
  tubeMap.setSoftClipsFlag(visOptions.showSoftClips);
  tubeMap.setColoredNodes(visOptions.coloredNodes);

  for (let key of Object.keys(visOptions.colorSchemes)) {
    tubeMap.setColorSet(key, {
      ...visOptions.colorSchemes[key],
      colorReadsByMappingQuality: visOptions.colorReadsByMappingQuality,
      alphaReadsByMappingQuality: visOptions.alphaReadsByMappingQuality,
    });
  }
  tubeMap.setMappingQualityCutoff(visOptions.mappingQualityCutoff);
  tubeMap.setFocusReadNames(visOptions.focusReadNames);
}

function TubeMap({ nodes, tracks, reads, region, visOptions, nodeSequences = true }) {
  useEffect(() => {
    console.log("New node count:", (nodes || []).length);
    console.log("New read count:", (reads || []).length);
    updateVisOptions(visOptions, nodeSequences);
    tubeMap.create({ svgID: "#svg", nodes, tracks, reads, region, visOptions });
  });

  return <svg id="svg" alt="Rendered sequence tube map visualization" />;
}

export default TubeMap;
