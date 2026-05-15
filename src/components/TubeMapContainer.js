import { useState, useEffect } from "react";
import { Container, Row, Alert } from "reactstrap";

import TubeMap from "./TubeMap";
import * as tubeMap from "../util/tubemap";
import { dataOriginTypes } from "../enums";
import PopUpInfoDialog from "./PopUpInfoDialog";
import ReadContextMenu from "./ReadContextMenu";
import NodeContextMenu from "./NodeContextMenu";
import PendingPanel from "./PendingPanel";
import ReadGroupsPanel from "./ReadGroupsPanel";

const GROUP_PALETTE_CYCLE = ["reds", "blues", "ygreys", "greys", "lightColors", "plainColors"];

function readsFromStringToArray(readsString) {
  return readsString.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
}

function TubeMapContainer({ viewTarget, dataOrigin, visOptions, APIInterface }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [infoDialogContent, setInfoDialogContent] = useState(undefined);
  const [readContextMenu, setReadContextMenu] = useState(null);
  const [nodeContextMenu, setNodeContextMenu] = useState(null);
  const [pendingReadSet, setPendingReadSet] = useState([]);
  const [pendingNodeSet, setPendingNodeSet] = useState([]);
  const [focusReadNames, setFocusReadNames] = useState(null);
  const [readGroups, setReadGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupCounter, setGroupCounter] = useState(0);
  const [otherReadsColor, setOtherReadsColor] = useState("greys");
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
          const newNodes = tubeMap.vgExtractNodes(json.graph, json.nameMap);
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
    tubeMap.setNodeContextMenuCallback((menu) => setNodeContextMenu(menu));
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

  // When the user starts editing a fresh set while a filter is active, seed
  // pending with the active filter so adding/removing reads extends the
  // current filter instead of replacing it.
  const editingBase =
    pendingReadSet.length === 0 && focusReadNames !== null
      ? focusReadNames
      : pendingReadSet;

  const addNamesToPendingSet = (names) => {
    const next = [...editingBase];
    names.forEach((name) => {
      if (!next.includes(name)) next.push(name);
    });
    setPendingReadSet(next);
    setReadContextMenu(null);
    setNodeContextMenu(null);
  };

  const addNodeToNodeSet = (nodeName) => {
    setPendingNodeSet(
      pendingNodeSet.includes(nodeName)
        ? pendingNodeSet
        : [...pendingNodeSet, nodeName]
    );
    setNodeContextMenu(null);
  };

  const addReadsThroughNodeSet = (mode) => {
    addNamesToPendingSet(tubeMap.getReadNamesThroughNodes(pendingNodeSet, mode));
  };

  const createGroup = (reads) => {
    const n = groupCounter + 1;
    const id = `g${n}`;
    const newGroup = {
      id,
      name: `Group ${n}`,
      color: GROUP_PALETTE_CYCLE[groupCounter % GROUP_PALETTE_CYCLE.length],
      reads,
    };
    setReadGroups([...readGroups, newGroup]);
    setActiveGroupId(id);
    setGroupCounter(n);
    return id;
  };

  const saveAsGroup = () => {
    if (pendingReadSet.length === 0) return;
    createGroup(pendingReadSet);
    setPendingReadSet([]);
  };

  const addReadsToGroup = (groupId, names) => {
    setReadGroups(
      readGroups.map((g) => {
        if (g.id !== groupId) return g;
        const merged = [...g.reads];
        names.forEach((name) => {
          if (!merged.includes(name)) merged.push(name);
        });
        return { ...g, reads: merged };
      })
    );
  };

  const addToActiveGroup = () => {
    if (pendingReadSet.length === 0 || activeGroupId === null) return;
    addReadsToGroup(activeGroupId, pendingReadSet);
    setPendingReadSet([]);
  };

  const addToActiveGroupFromMenu = (names) => {
    if (activeGroupId === null) return;
    addReadsToGroup(activeGroupId, names);
    setReadContextMenu(null);
    setNodeContextMenu(null);
  };

  const renameGroup = (id, name) => {
    setReadGroups(readGroups.map((g) => (g.id === id ? { ...g, name } : g)));
  };

  const recolorGroup = (id, color) => {
    setReadGroups(readGroups.map((g) => (g.id === id ? { ...g, color } : g)));
  };

  const deleteGroup = (id) => {
    setReadGroups(readGroups.filter((g) => g.id !== id));
    if (activeGroupId === id) setActiveGroupId(null);
  };

  const activeGroup = readGroups.find((g) => g.id === activeGroupId);
  const pendingReadActions = [
    {
      label: `Filter to these ${pendingReadSet.length} read${pendingReadSet.length === 1 ? "" : "s"}`,
      onClick: () => { setFocusReadNames(pendingReadSet); setPendingReadSet([]); },
    },
    {
      label: "Save as group",
      onClick: () => saveAsGroup(),
    },
    ...(activeGroup
      ? [{
          label: `Add to "${activeGroup.name}"`,
          onClick: () => addToActiveGroup(),
        }]
      : []),
    {
      label: "Clear set",
      onClick: () => setPendingReadSet([]),
    },
  ];

  const isOpen = infoDialogContent !== undefined;

  return (
    <div id="tubeMapContainer">
      <PopUpInfoDialog open={isOpen} attributes={infoDialogContent} close={() => setInfoDialogContent(undefined)} />
      {pendingNodeSet.length > 0 ? (
        <PendingPanel
          variant="node"
          title={`Node set (${pendingNodeSet.length}):`}
          items={pendingNodeSet}
          onRemove={(nodeName) => setPendingNodeSet(pendingNodeSet.filter((n) => n !== nodeName))}
          actions={[
            {
              label: `Add reads through all ${pendingNodeSet.length} node${pendingNodeSet.length === 1 ? "" : "s"} (intersection)`,
              onClick: () => addReadsThroughNodeSet("all"),
            },
            {
              label: "Add reads through any (union)",
              onClick: () => addReadsThroughNodeSet("any"),
            },
            {
              label: "Clear node set",
              onClick: () => setPendingNodeSet([]),
            },
          ]}
        />
      ) : null}
      {pendingReadSet.length > 0 ? (
        <PendingPanel
          variant="read"
          title={`Read set (${pendingReadSet.length}):`}
          items={pendingReadSet}
          onRemove={(name) => setPendingReadSet(pendingReadSet.filter((n) => n !== name))}
          actions={pendingReadActions}
        />
      ) : null}
      {readGroups.length > 0 ? (
        <ReadGroupsPanel
          groups={readGroups}
          activeGroupId={activeGroupId}
          otherReadsColor={otherReadsColor}
          onSetActive={(id) => setActiveGroupId(id)}
          onRename={(id, name) => renameGroup(id, name)}
          onRecolor={(id, color) => recolorGroup(id, color)}
          onDelete={(id) => deleteGroup(id)}
          onRecolorOther={(color) => setOtherReadsColor(color)}
        />
      ) : null}
      {focusReadNames ? (
        <PendingPanel
          variant="filter"
          title={`Showing ${focusReadNames.length} read${focusReadNames.length === 1 ? "" : "s"}:`}
          items={focusReadNames}
          actions={[
            {
              label: "Clear filter",
              onClick: () => setFocusReadNames(null),
            },
          ]}
        />
      ) : null}
      <div id="tubeMapSVG">
        <TubeMap
          nodes={nodes}
          tracks={tracks}
          reads={reads}
          region={region}
          visOptions={{ coloredNodes, ...visOptions, focusReadNames, readGroups, otherReadsColor }}
          nodeSequences={!viewTarget.removeSequences}
        />
      </div>
      {readContextMenu ? (
        <ReadContextMenu
          readName={readContextMenu.readName}
          x={readContextMenu.x}
          y={readContextMenu.y}
          alreadyInSet={editingBase.includes(readContextMenu.readName)}
          activeGroup={activeGroup}
          alreadyInActiveGroup={
            activeGroup ? activeGroup.reads.includes(readContextMenu.readName) : false
          }
          onFilter={(name) => { setFocusReadNames([name]); setReadContextMenu(null); }}
          onAddToSet={(name) => addNamesToPendingSet([name])}
          onAddToActiveGroup={(name) => addToActiveGroupFromMenu([name])}
          onClose={() => setReadContextMenu(null)}
        />
      ) : null}
      {nodeContextMenu ? (
        <NodeContextMenu
          nodeName={nodeContextMenu.nodeName}
          readNames={nodeContextMenu.readNames}
          alreadyInNodeSet={pendingNodeSet.includes(nodeContextMenu.nodeName)}
          x={nodeContextMenu.x}
          y={nodeContextMenu.y}
          activeGroup={activeGroup}
          onAddReadsToSet={(names) => addNamesToPendingSet(names)}
          onAddReadsToActiveGroup={(names) => addToActiveGroupFromMenu(names)}
          onAddNodeToNodeSet={(name) => addNodeToNodeSet(name)}
          onClose={() => setNodeContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

export default TubeMapContainer;
