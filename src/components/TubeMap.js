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
  tubeMap.setShowNodeLabels(visOptions.showNodeLabels);
  tubeMap.setNodeLabelColorScheme(visOptions.nodeLabelColorScheme);

  for (let key of Object.keys(visOptions.colorSchemes)) {
    tubeMap.setColorSet(key, {
      ...visOptions.colorSchemes[key],
      colorReadsByMappingQuality: visOptions.colorReadsByMappingQuality,
      alphaReadsByMappingQuality: visOptions.alphaReadsByMappingQuality,
    });
  }
  tubeMap.setMappingQualityCutoff(visOptions.mappingQualityCutoff);
  tubeMap.setFocusReadNames(visOptions.focusReadNames);
  tubeMap.setReadGroups(visOptions.readGroups);
  tubeMap.setOtherReadsColor(visOptions.otherReadsColor);
}

function TubeMap({ nodes, tracks, reads, region, visOptions, nodeSequences = true }) {
  useEffect(() => {
    updateVisOptions(visOptions, nodeSequences);
    tubeMap.create({ svgID: "#svg", nodes, tracks, reads, region, visOptions });
  }, [nodes, tracks, reads, region, visOptions, nodeSequences]);

  return <svg id="svg" alt="Rendered sequence tube map visualization" />;
}

export default TubeMap;
