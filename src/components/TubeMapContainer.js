import React, { Component } from "react";
import PropTypes from "prop-types";
import { Container, Row, Alert } from "reactstrap";
import isEqual from "react-fast-compare";

import TubeMap from "./TubeMap";
import * as tubeMap from "../util/tubemap";
import { dataOriginTypes } from "../enums";
import PopUpInfoDialog from "./PopUpInfoDialog";
import ReadContextMenu from "./ReadContextMenu";
import NodeContextMenu from "./NodeContextMenu";
import PendingPanel from "./PendingPanel";

class TubeMapContainer extends Component {
  state = {
    isLoading: true,
    error: null,
    infoDialogContent: undefined,
    readContextMenu: null,
    nodeContextMenu: null,
    pendingReadSet: [],
    pendingNodeSet: [],
    focusReadNames: null,
  };

  componentDidMount() {
    this.fetchCanceler = new AbortController();
    this.cancelSignal = this.fetchCanceler.signal;
    this.getRemoteTubeMapData();
  }

  componentWillUnmount() {
    // Cancel the requests since we may have long running requests pending.
    this.fetchCanceler.abort();
  }

  handleFetchError(error, message) {
    if (!this.cancelSignal.aborted) {
      console.error(message, error);
      this.setState({ error: error, isLoading: false });
    } else {
      console.log("fetch canceled by componentWillUnmount", error.message);
    }
  }

  componentDidUpdate(prevProps) {
    // TODO: this is the way the React docs say to make requests (do them when
    // the component updates), but when we make a request we pop ourselves into
    // a loading state and immediately do another update, which then means we
    // have to mess around with deep comparison to see we don't need yet a
    // third update. Is there a way to let React keep track of the fact that we
    // aren't up to date with the requested state yet?
    if (this.props.dataOrigin !== prevProps.dataOrigin) {
      this.props.dataOrigin === dataOriginTypes.API
        ? this.getRemoteTubeMapData()
        : this.getExampleData();
    } else {
      if (!isEqual(this.props.viewTarget, prevProps.viewTarget)) {
        // We need to compare the fetch parameters with stringification because
        // they will get swapped out for a different object all the time, and we
        // don't want to compare object identity. TODO: stringify isn't
        // guaranteed to be stable so we can still make extra requests.
        this.getRemoteTubeMapData();
      }
    }
    // updating visOptions will cause an error if the tubemap is not in place yet.
    if (!this.state.isLoading) {
      // Hook into item clicks form the tube map
      tubeMap.setInfoCallback((text) => {
        this.setState({ infoDialogContent: text });
      });
      tubeMap.setReadContextMenuCallback((menu) => {
        this.setState({ readContextMenu: menu });
      });
      tubeMap.setNodeContextMenuCallback((menu) => {
        this.setState({ nodeContextMenu: menu });
      });
    }
  }

  render() {
    const { isLoading, error } = this.state;

    if (error) {
      const message = error.message ? error.message : error;
      return (
        <div id="tubeMapContainer">
          <Container>
            <Row>
              <Alert color="danger">{message}</Alert>
            </Row>
          </Container>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div id="tubeMapContainer">
          <Container>
            <Row>
              <div id="loaderContainer">
                <div id="loader" />
              </div>
            </Row>
          </Container>
        </div>
      );
    }

    const attributes = this.state.infoDialogContent;
    const isOpen = attributes !== undefined;
    const closePopup = () => this.setState({ infoDialogContent: undefined });
    const {
      readContextMenu,
      nodeContextMenu,
      pendingReadSet,
      pendingNodeSet,
      focusReadNames,
    } = this.state;
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
      this.setState({
        pendingReadSet: next,
        readContextMenu: null,
        nodeContextMenu: null,
      });
    };
    const removeFromPendingSet = (name) => {
      this.setState({
        pendingReadSet: pendingReadSet.filter((n) => n !== name),
      });
    };
    const addNodeToNodeSet = (nodeName) => {
      this.setState({
        pendingNodeSet: pendingNodeSet.includes(nodeName)
          ? pendingNodeSet
          : [...pendingNodeSet, nodeName],
        nodeContextMenu: null,
      });
    };
    const removeFromNodeSet = (nodeName) => {
      this.setState({
        pendingNodeSet: pendingNodeSet.filter((n) => n !== nodeName),
      });
    };
    const addReadsThroughNodeSet = (mode) => {
      addNamesToPendingSet(
        tubeMap.getReadNamesThroughNodes(pendingNodeSet, mode)
      );
    };

    return (
      <div id="tubeMapContainer">
        <PopUpInfoDialog
          open={isOpen}
          attributes={attributes}
          close={closePopup}
        />
        {pendingNodeSet.length > 0 ? (
          <PendingPanel
            variant="node"
            title={`Node set (${pendingNodeSet.length}):`}
            items={pendingNodeSet}
            onRemove={removeFromNodeSet}
            actions={[
              {
                label: `Add reads through all ${pendingNodeSet.length} node${
                  pendingNodeSet.length === 1 ? "" : "s"
                } (intersection)`,
                onClick: () => addReadsThroughNodeSet("all"),
              },
              {
                label: "Add reads through any (union)",
                onClick: () => addReadsThroughNodeSet("any"),
              },
              {
                label: "Clear node set",
                onClick: () => this.setState({ pendingNodeSet: [] }),
              },
            ]}
          />
        ) : null}
        {pendingReadSet.length > 0 ? (
          <PendingPanel
            variant="read"
            title={`Read set (${pendingReadSet.length}):`}
            items={pendingReadSet}
            onRemove={removeFromPendingSet}
            actions={[
              {
                label: `Filter to these ${pendingReadSet.length} read${
                  pendingReadSet.length === 1 ? "" : "s"
                }`,
                onClick: () =>
                  this.setState({
                    focusReadNames: pendingReadSet,
                    pendingReadSet: [],
                  }),
              },
              {
                label: "Clear set",
                onClick: () => this.setState({ pendingReadSet: [] }),
              },
            ]}
          />
        ) : null}
        {focusReadNames ? (
          <PendingPanel
            variant="filter"
            title={`Showing ${focusReadNames.length} read${
              focusReadNames.length === 1 ? "" : "s"
            }:`}
            items={focusReadNames}
            actions={[
              {
                label: "Clear filter",
                onClick: () => this.setState({ focusReadNames: null }),
              },
            ]}
          />
        ) : null}
        <div id="tubeMapSVG">
          <TubeMap
            nodes={this.state.nodes}
            tracks={this.state.tracks}
            reads={this.state.reads}
            region={this.state.region}
            visOptions={{
              coloredNodes: this.state.coloredNodes,
              ...this.props.visOptions,
              focusReadNames: focusReadNames,
            }}
            nodeSequences={!this.props.viewTarget.removeSequences}
          />
        </div>
        {readContextMenu ? (
          <ReadContextMenu
            readName={readContextMenu.readName}
            x={readContextMenu.x}
            y={readContextMenu.y}
            alreadyInSet={editingBase.includes(readContextMenu.readName)}
            onFilter={(name) =>
              this.setState({
                focusReadNames: [name],
                readContextMenu: null,
              })
            }
            onAddToSet={(name) => addNamesToPendingSet([name])}
            onClose={() => this.setState({ readContextMenu: null })}
          />
        ) : null}
        {nodeContextMenu ? (
          <NodeContextMenu
            nodeName={nodeContextMenu.nodeName}
            readNames={nodeContextMenu.readNames}
            alreadyInNodeSet={pendingNodeSet.includes(nodeContextMenu.nodeName)}
            x={nodeContextMenu.x}
            y={nodeContextMenu.y}
            onAddReadsToSet={(names) => addNamesToPendingSet(names)}
            onAddNodeToNodeSet={(name) => addNodeToNodeSet(name)}
            onClose={() => this.setState({ nodeContextMenu: null })}
          />
        ) : null}
      </div>
    );
  }

  getRemoteTubeMapData = async () => {
    this.setState({ isLoading: true, error: null });
    try {
      const json = await this.props.APIInterface.getChunkedData(
        this.props.viewTarget,
        this.cancelSignal
      );
      if (json.graph === undefined) {
        // We did not get back a graph, even if we didn't get an error either.
        const error = "Fetching remote data returned error";
        throw new Error(error);
      } else {
        // go through viewTarget and create array of read file track numbers
        let readTrackIDs = [];
        // And the graph track number if any
        let graphTrackID = null;
        // And the haplotype track number if any
        let haplotypeTrackID = null;

        console.log("getting viewTarget ", this.props.viewTarget);
        for (const i in this.props.viewTarget.tracks) {
          const track = this.props.viewTarget.tracks[i];
          if (track.trackType === "read") {
            //add track index to array if the track contains a gam file
            readTrackIDs.push(i);
          }
          if (track.trackType === "graph") {
            // Or note if it is a graph (one allowed)
            graphTrackID = i;
          }
          if (track.trackType === "haplotype") {
            // Or a collection of haplotypes (one allowed)
            haplotypeTrackID = i;
          }
        }

        console.log(
          "Graph track: " +
            graphTrackID +
            " Haplotype track: " +
            haplotypeTrackID
        );

        const nodes = tubeMap.vgExtractNodes(json.graph);
        const tracks = tubeMap.vgExtractTracks(
          json.graph,
          graphTrackID,
          haplotypeTrackID
        );

        // Call vgExtractReads on each file of reads and store in readsArr
        let readsArr = [];
        // Count total reads seen so far.
        let totalReads = 0;
        for (const gam of json.gam) {
          // For each returned list of reads from a file, convert all those reads to tube map format.
          // Include total read count to prevent duplicate ids.
          // Also include the source track's ID.
          let newReads = tubeMap.vgExtractReads(
            nodes,
            tracks,
            gam,
            totalReads,
            readTrackIDs[readsArr.length]
          );
          readsArr.push(newReads);
          totalReads += newReads.length;
        }

        // concatenate all reads together
        const reads = readsArr.flat();

        const region = json.region;
        const coloredNodes = json.coloredNodes;
        this.setState({
          isLoading: false,
          nodes,
          tracks,
          reads,
          region,
          coloredNodes,
        });
      }
    } catch (error) {
      this.handleFetchError(
        error,
        "Fetching and parsing getChunkedData failed:"
      );
    }
  };

  getExampleData = async () => {
    this.setState({ isLoading: true });
    // Nodes, tracks, and reads are all required, so start with defaults.
    let nodes = [];
    let tracks = [];
    let reads = [];
    let region = [];
    let vg;
    const data = await import("../util/demo-data");
    nodes = data.inputNodes;
    switch (this.props.dataOrigin) {
      case dataOriginTypes.EXAMPLE_1:
        tracks = data.inputTracks1;
        break;
      case dataOriginTypes.EXAMPLE_2:
        tracks = data.inputTracks2;
        break;
      case dataOriginTypes.EXAMPLE_3:
        tracks = data.inputTracks3;
        break;
      case dataOriginTypes.EXAMPLE_4:
        tracks = data.inputTracks4;
        break;
      case dataOriginTypes.EXAMPLE_5:
        tracks = data.inputTracks5;
        break;
      case dataOriginTypes.EXAMPLE_6:
        vg = JSON.parse(data.k3138);
        nodes = tubeMap.vgExtractNodes(vg);
        tracks = tubeMap.vgExtractTracks(vg, 0, 0); // Examples have paths and haplotypes as track 0.
        reads = tubeMap.vgExtractReads(
          nodes,
          tracks,
          this.readsFromStringToArray(data.demoReads),
          0,
          1 // Examples always have reads as track 1
        );
        break;
      case dataOriginTypes.EXAMPLE_7:
        vg = data.reverseAlignmentGraph;
        nodes = tubeMap.vgExtractNodes(vg);
        tracks = tubeMap.vgExtractTracks(vg, 0, 0); // Examples have paths and haplotypes as track 0.
        reads = tubeMap.vgExtractReads(
          nodes,
          tracks,
          data.mixedAlignmentReads,
          0,
          1 // Examples always have reads as track 1
        );
        break;
      case dataOriginTypes.EXAMPLE_8:
        vg = data.cycleGraph;
        nodes = tubeMap.vgExtractNodes(vg);
        tracks = tubeMap.vgExtractTracks(vg, 0, 0); // Examples have paths and haplotypes as track 0.
        reads = tubeMap.vgExtractReads(
          nodes,
          tracks,
          data.cycleReads,
          0,
          1 // Examples always have reads as track 1
        );

        break;
      case dataOriginTypes.EXAMPLE_9:
        vg = data.cycle2Graph;
        nodes = tubeMap.vgExtractNodes(vg);
        tracks = tubeMap.vgExtractTracks(vg, 0, 0); // Examples have paths and haplotypes as track 0.
        reads = tubeMap.vgExtractReads(
          nodes,
          tracks,
          data.cycle2Reads,
          0,
          1 // Examples always have reads as track 1
        );

        break;
      case dataOriginTypes.NO_DATA:
        // Leave the data empty.
        break;
      default:
        console.log("invalid example data origin type:", this.props.dataOrigin);
    }

    this.setState({ isLoading: false, nodes, tracks, reads, region });
  };

  readsFromStringToArray = (readsString) => {
    const lines = readsString.split("\n");
    const result = [];
    lines.forEach((line) => {
      if (line.length > 0) {
        result.push(JSON.parse(line));
      }
    });
    return result;
  };
}

TubeMapContainer.propTypes = {
  dataOrigin: PropTypes.oneOf(Object.values(dataOriginTypes)).isRequired,
  viewTarget: PropTypes.object.isRequired,
  visOptions: PropTypes.object.isRequired,
  APIInterface: PropTypes.object.isRequired,
};

export default TubeMapContainer;
