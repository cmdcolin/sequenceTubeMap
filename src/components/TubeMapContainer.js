import React, { Component } from "react";
import PropTypes from "prop-types";
import { Container, Row, Alert } from "reactstrap";
import isEqual from "react-fast-compare";

import TubeMap from "./TubeMap";
import * as tubeMap from "../util/tubemap";
import { dataOriginTypes } from "../enums";
import PopUpInfoDialog from "./PopUpInfoDialog";
import ReadContextMenu from "./ReadContextMenu";

const PENDING_PANEL_STYLE = {
  padding: "8px 12px",
  background: "#e7f3ff",
  border: "1px solid #bcdcff",
  borderRadius: "4px",
  margin: "8px 0",
  fontSize: "14px",
};

const PENDING_HEADER_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "6px",
};

const CHIP_LIST_STYLE = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const CHIP_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  background: "white",
  border: "1px solid #bcdcff",
  borderRadius: "12px",
  padding: "2px 4px 2px 10px",
  fontSize: "13px",
};

const CHIP_REMOVE_STYLE = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: "1",
  padding: "0 4px",
  color: "#666",
};

const ACTIVE_FILTER_STYLE = {
  padding: "6px 12px",
  background: "#fff3cd",
  border: "1px solid #ffeeba",
  borderRadius: "4px",
  margin: "8px 0",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
};

class TubeMapContainer extends Component {
  state = {
    isLoading: true,
    error: null,
    infoDialogContent: undefined,
    readContextMenu: null,
    pendingReadSet: [],
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

    // infoDialogContent's value was initialized to undefined, representing a closed dialog,
    // and will be set to text to display to represent an open dialog.
    // text stores the current value associated with infoDialogContent for this
    // TubeMapContainer instance, so we can have a shorter name for it.
    let attributes = this.state.infoDialogContent;
    let isOpen;
    if (attributes === undefined) {
      isOpen = false;
    } else {
      isOpen = true;
    }
    // resets value of infoDialogContent upon close
    const closePopup = () => this.setState({ infoDialogContent: undefined });
    const { readContextMenu, pendingReadSet, focusReadNames } = this.state;
    const isInPendingSet = (name) => pendingReadSet.includes(name);
    const addToPendingSet = (name) => {
      if (!isInPendingSet(name)) {
        this.setState({
          pendingReadSet: [...pendingReadSet, name],
          readContextMenu: null,
        });
      } else {
        this.setState({ readContextMenu: null });
      }
    };
    const removeFromPendingSet = (name) => {
      this.setState({
        pendingReadSet: pendingReadSet.filter((n) => n !== name),
      });
    };
    const applyPendingAsFilter = () => {
      this.setState({
        focusReadNames: [...pendingReadSet],
        pendingReadSet: [],
      });
    };

    return (
      <div id="tubeMapContainer">
        <PopUpInfoDialog
          open={isOpen}
          attributes={attributes}
          close={closePopup}
        />
        {pendingReadSet.length > 0 ? (
          <div style={PENDING_PANEL_STYLE}>
            <div style={PENDING_HEADER_STYLE}>
              <span>
                Read set ({pendingReadSet.length}):
              </span>
              <button type="button" onClick={() => applyPendingAsFilter()}>
                Filter to these {pendingReadSet.length} read
                {pendingReadSet.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => this.setState({ pendingReadSet: [] })}
              >
                Clear set
              </button>
            </div>
            <div style={CHIP_LIST_STYLE}>
              {pendingReadSet.map((name) => (
                <span key={name} style={CHIP_STYLE}>
                  {name}
                  <button
                    type="button"
                    style={CHIP_REMOVE_STYLE}
                    onClick={() => removeFromPendingSet(name)}
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {focusReadNames ? (
          <div style={ACTIVE_FILTER_STYLE}>
            <span>
              {focusReadNames.length === 1 ? (
                <>
                  Showing only read: <strong>{focusReadNames[0]}</strong>
                </>
              ) : (
                <>
                  Showing only <strong>{focusReadNames.length}</strong> reads:{" "}
                  <span title={focusReadNames.join(", ")}>
                    {focusReadNames.slice(0, 3).join(", ")}
                    {focusReadNames.length > 3
                      ? `, +${focusReadNames.length - 3} more`
                      : ""}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => this.setState({ focusReadNames: null })}
            >
              Clear filter
            </button>
          </div>
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
            alreadyInSet={isInPendingSet(readContextMenu.readName)}
            onFilter={(name) =>
              this.setState({
                focusReadNames: [name],
                readContextMenu: null,
              })
            }
            onAddToSet={(name) => addToPendingSet(name)}
            onClose={() => this.setState({ readContextMenu: null })}
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
