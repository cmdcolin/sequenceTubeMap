import React, { useState, useEffect } from "react";
import { Container, Row, Alert } from "reactstrap";

import TubeMap from "./TubeMap";
import * as tubeMap from "../util/tubemap";
import { dataOriginTypes } from "../enums";
import PopUpInfoDialog from "./PopUpInfoDialog";
import ReadContextMenu from "./ReadContextMenu";

function readsFromStringToArray(readsString) {
  return readsString.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
}

function TubeMapContainer({ viewTarget, dataOrigin, visOptions, APIInterface }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [infoDialogContent, setInfoDialogContent] = useState(undefined);
  const [readContextMenu, setReadContextMenu] = useState(null);
  const [focusReadName, setFocusReadName] = useState(null);
  const [nodes, setNodes] = useState(undefined);
  const [tracks, setTracks] = useState(undefined);
  const [reads, setReads] = useState(undefined);
  const [region, setRegion] = useState(undefined);
  const [coloredNodes, setColoredNodes] = useState(undefined);

  useEffect(() => {
    const abortController = new AbortController();
    const cancelSignal = abortController.signal;

    if (dataOrigin === dataOriginTypes.API) {
      setIsLoading(true);
      setError(null);
      APIInterface.getChunkedData(viewTarget, cancelSignal)
        .then((json) => {
          if (json.graph === undefined) {
            throw new Error("Fetching remote data returned error");
          }
          let readTrackIDs = [];
          let graphTrackID = null;
          let haplotypeTrackID = null;
          console.log("getting viewTarget ", viewTarget);
          for (const i in viewTarget.tracks) {
            const track = viewTarget.tracks[i];
            if (track.trackType === "read") readTrackIDs.push(i);
            if (track.trackType === "graph") graphTrackID = i;
            if (track.trackType === "haplotype") haplotypeTrackID = i;
          }
          console.log("Graph track: " + graphTrackID + " Haplotype track: " + haplotypeTrackID);
          const newNodes = tubeMap.vgExtractNodes(json.graph);
          const newTracks = tubeMap.vgExtractTracks(json.graph, graphTrackID, haplotypeTrackID);
          let readsArr = [];
          let totalReads = 0;
          for (const gam of json.gam) {
            const newReads = tubeMap.vgExtractReads(newNodes, newTracks, gam, totalReads, readTrackIDs[readsArr.length]);
            readsArr.push(newReads);
            totalReads += newReads.length;
          }
          setNodes(newNodes);
          setTracks(newTracks);
          setReads(readsArr.flat());
          setRegion(json.region);
          setColoredNodes(json.coloredNodes);
          setIsLoading(false);
        })
        .catch((err) => {
          if (!cancelSignal.aborted) {
            console.error("Fetching and parsing getChunkedData failed:", err);
            setError(err);
            setIsLoading(false);
          } else {
            console.log("fetch canceled by unmount", err.message);
          }
        });
    } else {
      setIsLoading(true);
      import("../util/demo-data").then((data) => {
        let newNodes = [];
        let newTracks = [];
        let newReads = [];
        let newRegion = [];
        let vg;
        newNodes = data.inputNodes;
        switch (dataOrigin) {
          case dataOriginTypes.EXAMPLE_1:
            newTracks = data.inputTracks1;
            break;
          case dataOriginTypes.EXAMPLE_2:
            newTracks = data.inputTracks2;
            break;
          case dataOriginTypes.EXAMPLE_3:
            newTracks = data.inputTracks3;
            break;
          case dataOriginTypes.EXAMPLE_4:
            newTracks = data.inputTracks4;
            break;
          case dataOriginTypes.EXAMPLE_5:
            newTracks = data.inputTracks5;
            break;
          case dataOriginTypes.EXAMPLE_6:
            vg = JSON.parse(data.k3138);
            newNodes = tubeMap.vgExtractNodes(vg);
            newTracks = tubeMap.vgExtractTracks(vg, 0, 0);
            newReads = tubeMap.vgExtractReads(newNodes, newTracks, readsFromStringToArray(data.demoReads), 0, 1);
            break;
          case dataOriginTypes.EXAMPLE_7:
            vg = data.reverseAlignmentGraph;
            newNodes = tubeMap.vgExtractNodes(vg);
            newTracks = tubeMap.vgExtractTracks(vg, 0, 0);
            newReads = tubeMap.vgExtractReads(newNodes, newTracks, data.mixedAlignmentReads, 0, 1);
            break;
          case dataOriginTypes.EXAMPLE_8:
            vg = data.cycleGraph;
            newNodes = tubeMap.vgExtractNodes(vg);
            newTracks = tubeMap.vgExtractTracks(vg, 0, 0);
            newReads = tubeMap.vgExtractReads(newNodes, newTracks, data.cycleReads, 0, 1);
            break;
          case dataOriginTypes.EXAMPLE_9:
            vg = data.cycle2Graph;
            newNodes = tubeMap.vgExtractNodes(vg);
            newTracks = tubeMap.vgExtractTracks(vg, 0, 0);
            newReads = tubeMap.vgExtractReads(newNodes, newTracks, data.cycle2Reads, 0, 1);
            break;
          case dataOriginTypes.NO_DATA:
            break;
          default:
            console.log("invalid example data origin type:", dataOrigin);
        }
        setNodes(newNodes);
        setTracks(newTracks);
        setReads(newReads);
        setRegion(newRegion);
        setIsLoading(false);
      });
    }

    return () => abortController.abort();
  }, [dataOrigin, viewTarget, APIInterface]);

  useEffect(() => {
    tubeMap.setInfoCallback((text) => setInfoDialogContent(text));
    tubeMap.setReadContextMenuCallback((menu) => setReadContextMenu(menu));
  }, []);

  if (error) {
    const message = error.message ? error.message : error;
    return (
      <div id="tubeMapContainer">
        <Container><Row><Alert color="danger">{message}</Alert></Row></Container>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div id="tubeMapContainer">
        <Container><Row><div id="loaderContainer"><div id="loader" /></div></Row></Container>
      </div>
    );
  }

  const isOpen = infoDialogContent !== undefined;

  return (
    <div id="tubeMapContainer">
      <PopUpInfoDialog open={isOpen} attributes={infoDialogContent} close={() => setInfoDialogContent(undefined)} />
      {focusReadName ? (
        <div
          style={{
            padding: "6px 12px",
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            borderRadius: "4px",
            margin: "8px 0",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <span>Showing only read: <strong>{focusReadName}</strong></span>
          <button type="button" onClick={() => setFocusReadName(null)}>Clear</button>
        </div>
      ) : null}
      <div id="tubeMapSVG">
        <TubeMap
          nodes={nodes}
          tracks={tracks}
          reads={reads}
          region={region}
          visOptions={{ coloredNodes, ...visOptions, focusReadName }}
          nodeSequences={!viewTarget.removeSequences}
        />
      </div>
      {readContextMenu ? (
        <ReadContextMenu
          readName={readContextMenu.readName}
          x={readContextMenu.x}
          y={readContextMenu.y}
          onFilter={(name) => { setFocusReadName(name); setReadContextMenu(null); }}
          onClose={() => setReadContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

export default TubeMapContainer;
