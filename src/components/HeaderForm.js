import React, { useState, useEffect, useRef } from "react";
import { Container, Row, Col, Label, Alert, Button } from "reactstrap";
import { dataOriginTypes } from "../enums";
import "../config-client.js";
import { config } from "../config-global.mjs";
import { LocalAPI } from "../api/LocalAPI.mjs";
import DataPositionFormRow from "./DataPositionFormRow";
import ExampleSelectButtons from "./ExampleSelectButtons";
import RegionInput from "./RegionInput";
import PathsPanel from "./PathsPanel";
import TrackPicker from "./TrackPicker";
import BedFileDropdown from "./BedFileDropdown";
import MenuItem from "@mui/material/MenuItem";
import MuiSelect from "@mui/material/Select";
import FormHelperText from "@mui/material/FormHelperText";
import PopupDialog from "./PopupDialog.js";
import Switch from "react-switch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import {
  parseRegion,
  stringifyRegion,
  isEmpty,
  isValidURL,
  readsExist,
} from "../common.mjs";

// See src/Types.ts

const DATA_SOURCES = config.DATA_SOURCES;
const MAX_UPLOAD_SIZE_DESCRIPTION = "5 MB";
const dataTypes = {
  BUILT_IN: "built-in",
  CUSTOM_FILES: "mounted files",
  EXAMPLES: "examples",
};
const fileTypes = {
  GRAPH: "graph",
  HAPLOTYPE: "haplotype",
  NODE: "node",
  READ: "read",
  BED: "bed",
};

// We define the subset of the empty state that is safe to apply without
// clobbering downloaded data from the server which we need
const CLEAR_STATE = {
  // Select: The file name (or string "none") that is displayed in each
  // dropdown. From the corresponding SelectOptions list.
  // File: The file name actually used (or undefined)
  bedSelect: "none",

  // Description for the selected region, is not displayed when empty
  desc: "",

  // This tracks several arrays (desc, chr, start, end) of BED region data, with
  // one entry in each array per region.
  // desc: description of region, i.e. "region with no source graph available"
  // chr: path in graph where the region is on, i.e. in ref:2000-3000, "ref" is the chr
  // start: start of the region, i.e. in ref:2000-3000, 2000 is the start
  // end: end of the region, i.e. in ref:2000-3000, 3000 is the end
  // chunk: url/directory for preexisting cached chunk, or empty string if not available
  // tracks: object full of tracks to apply when user selects region, or null
  // so regionInfo might look like:
  /*
  {
    chr: [ '17', '17' ],
    start: [ '1', '1000' ],
    end: [ '100', '1200' ],
    desc: [ '17_1_100', '17_1000_1200' ],
    chunk: [ '', '' ],
    tracks: [ null, null ]
  }
  */
  regionInfo: {},

  // Path info (name, length, cyclic) for the current graph track.
  pathInfo: [],

  tracks: {},
  // BED file of regions to jump between. Regions may have pre-extracted chunks in the last column.
  // If not used, may be undefined or may have the sting value "none".
  bedFile: undefined,
  region: "",
  name: undefined,

  dataType: dataTypes.BUILT_IN,
  fileSizeAlert: false,
  uploadInProgress: false,
  error: null,

  viewTarget: undefined,
};

// We define the entire empty state template.
const EMPTY_STATE = {
  ...CLEAR_STATE,

  // SelectOptions: The options available in the dropdown displayed.

  // These ones are for selecting entire files and need to be preserved when
  // switching dataType.
  availableTracks: [],
  // This one is for the BED files. It needs to exist when we start up or we
  // will try and draw the BED dropdown without an array of options.
  availableBeds: [],
};

// Return true if file is set to a string file name or URL, and false if it is
// falsey or the "none" sentinel.
function isSet(file) {
  return (file !== "none" && file);
}

// Checks if two track objects in the current track set are equal
function tracksEqual(curr, next) {
  if ((curr === undefined) !== (next === undefined)) {
    // One is undefined and the other isn't
    return false;
  }

  const curr_file = curr.trackFile;
  const next_file = next.trackFile;

  const curr_settings = curr.trackColorSettings;
  const next_settings = next.trackColorSettings;

  // check if color settings are equal
  if (curr_settings && next_settings) {
    if (
      curr_settings.mainPalette !== next_settings.mainPalette ||
      curr_settings.auxPalette !== next_settings.auxPalette ||
      curr_settings.colorReadsByMappingQuality !==
        next_settings.colorReadsByMappingQuality ||
      curr_settings.alphaReadsByMappingQuality !==
        next_settings.alphaReadsByMappingQuality
    ) {
      return false;
    }
  }
  // count falsy file names as the same
  if ((!curr_file && !next_file) || curr_file === next_file) {
    return true;
  }
  return false;
}

// Checks if two view targets are the same. They are the same if they have the
// same tracks and the same region.
function viewTargetsEqual(currViewTarget, nextViewTarget) {
  // Update if one is undefined and the other isn't
  if ((currViewTarget === undefined) !== (nextViewTarget === undefined)) {
    return false;
  }

  // Update if view target tracks are not equal
  if (
    Object.keys(currViewTarget.tracks).length !==
    Object.keys(nextViewTarget.tracks).length
  ) {
    // Different lengths so not equal
    return false;
  }

  for (const key in currViewTarget.tracks) {
    const currTrack = currViewTarget.tracks[key];
    const nextTrack = nextViewTarget.tracks[key];

    // if the key doesn't exist in the other track
    if (!currTrack || !nextTrack) {
      return false;
    }

    if (!tracksEqual(currTrack, nextTrack)) {
      // Different tracks so not equal
      return false;
    }
  }

  if (currViewTarget.bedFile !== nextViewTarget.bedFile) {
    return false;
  }

  // Update if regions are not equal
  if (currViewTarget.region !== nextViewTarget.region) {
    return false;
  }

  if (currViewTarget.simplify !== nextViewTarget.simplify) {
    return false;
  }

  if (currViewTarget.removeSequences !== nextViewTarget.removeSequences) {
    return false;
  }

  return true;
}

/* determine the current region: accepts a region string and returns the region index

  example of regionInfo:
  {
    chr: [ '17', '17' ],
    start: [ '1', '1000' ],
    end: [ '100', '1200' ],
    desc: [ '17_1_100', '17_1000_1200' ],
    chunk: [ '', '' ],
    tracks: [ null, null ]
  }

  examples:
  if the regionString is "17:1-100", it would be parsed into {contig: "17", start: 1, end: 100} -> 0
  if the regionString is "17:1000-1200", it would be parsed into {contig: "17", start: 1000, end: 1200} -> 1
  if the regionString is "17:2000-3000", it cannot be found - return null

  The function uses this approach to find the regionIndex given regionString and regionInfo:
  function (region string){
    parse(region string) -> return {contig, start, end}
    loop over chr in region info
      determine if contig, start, end are present at the current index
      if present: return index
    return null
  }
*/
export const determineRegionIndex = (regionString, regionInfo) => {
  let parsedRegion;
  try {
    parsedRegion = parseRegion(regionString);
  } catch(error) {
    return null;
  }
  if (!regionInfo["chr"]){
    return null;
  }
  for (let i = 0; i < regionInfo["chr"].length; i++){
    if ((parseInt(regionInfo["start"][i]) === parsedRegion.start)
        && (parseInt(regionInfo["end"][i]) === parsedRegion.end)
        && (regionInfo["chr"][i] === parsedRegion.contig)){
          return i;
    }
  }
  return null;
}

/*
  This function takes in a regionIndex and regionInfo, and reconstructs a regionString from them
  assumes that index is valid in regionInfo

  example of regionInfo:
  {
    chr: [ '17', '17' ],
    start: [ '1', '1000' ],
    end: [ '100', '1200' ],
    desc: [ '17_1_100', '17_1000_1200' ],
    chunk: [ '', '' ],
    tracks: [ null, null ]
  }

  example of regionIndex: 0

  example of regionString: "17:1-100"
*/
export const regionStringFromRegionIndex = (regionIndex, regionInfo) => {
  let regionStart = regionInfo["start"][regionIndex];
  let regionEnd = regionInfo["end"][regionIndex];
  let regionContig = regionInfo["chr"][regionIndex];
  return regionContig + ":" + regionStart + "-" + regionEnd;
}

// Sadly JS doesn't have any notion of a tuple to key things on, so we need a way to make a string key
function makeKey(track) {
  return JSON.stringify([track.trackType, track.trackFile]);
}

// Get a Set keyed by makeKey() keys for tracks, listing all the available,
// non-implied tracks from a list of available tracks.
function makeAvailableTrackSet(availableTracks) {
  let available = new Set();
  for (let track of availableTracks) {
    if (!track.trackIsImplied) {
      available.add(makeKey(track));
    }
  }
  return available;
}

// Look up whether a selected track is implied (i.e. not in the given set).
function trackIsImplied(track, availableTrackSet) {
  return !availableTrackSet.has(makeKey(track));
}

// Given an array of available tracks (some of which may already be implied)
// and an object of currently selected tracks, return an array guaranteed to
// have entries for the tracks already selected. This ensures the user can
// switch back to them if they deselect them, even if they don't really exist
// server-side (which can happen if they are from pre-extracted regions).
//
// Removes existing implied tracks in the input.
function trackListWithImplied(availableTracks, availableTrackSet, currentTracks) {
  // Identify all available, non-implied tracks
  let newAvailableTracks = [];
  for (let track of availableTracks) {
    if (!track.trackIsImplied) {
      newAvailableTracks.push(track);
    }
  }

  // Identify all the current tracks that are not in the list already
  let unavailable = [];
  for (const key in currentTracks) {
    let track = currentTracks[key];
    if (trackIsImplied(track, availableTrackSet)) {
      // This track isn't available, so we'll have to do something for it
      unavailable.push(track);
    }
  }

  if (unavailable.length === 0) {
    // No tracks to add
    return newAvailableTracks;
  }

  // Now we need to add new entries for the ones we didn't see.
  for (let track of unavailable) {
    // For each unavailable track currently selected, make an available tracks
    // entry that knows it doesn't really exist in the API as a full track.
    newAvailableTracks.push({
      trackType: track.trackType,
      trackFile: track.trackFile,
      // Don't bring along the color settings.
      // Do mark it as an "implied" track that we need to remember sort of exists.
      trackIsImplied: true
    });
  }

  return newAvailableTracks;
}


// Get the first graph track in a collection of selected tracks, or a falsey
// value if there isn't one.
function firstGraphTrack(tracks) {
  for (const key in tracks) {
    let track = tracks[key];
    if (track.trackType === fileTypes.GRAPH) {
      return track;
    }
  }
  return null;
}


function HeaderForm({
  dataOrigin,
  setColorSetting,
  setDataOrigin,
  setCurrentViewTarget,
  getCurrentViewTarget,
  defaultViewTarget,
  APIInterface,
}) {
  const [bedSelect, setBedSelect] = useState(EMPTY_STATE.bedSelect);
  const [desc, setDesc] = useState(EMPTY_STATE.desc);
  const [regionInfo, setRegionInfo] = useState(EMPTY_STATE.regionInfo);
  const [pathInfo, setPathInfo] = useState(EMPTY_STATE.pathInfo);
  const [tracks, setTracks] = useState(EMPTY_STATE.tracks);
  const [bedFile, setBedFile] = useState(EMPTY_STATE.bedFile);
  const [region, setRegion] = useState(EMPTY_STATE.region);
  const [name, setName] = useState(EMPTY_STATE.name);
  const [dataType, setDataType] = useState(EMPTY_STATE.dataType);
  const [fileSizeAlert, setFileSizeAlert] = useState(EMPTY_STATE.fileSizeAlert);
  const [uploadInProgress, setUploadInProgress] = useState(EMPTY_STATE.uploadInProgress);
  const [error, setError] = useState(EMPTY_STATE.error);
  const [availableTracks, setAvailableTracks] = useState(EMPTY_STATE.availableTracks);
  const [availableBeds, setAvailableBeds] = useState(EMPTY_STATE.availableBeds);
  const [simplify, setSimplify] = useState(undefined);
  const [removeSequences, setRemoveSequences] = useState(undefined);
  const [popupOpen, setPopupOpen] = useState(false);

  // Ref for the AbortController — legitimate useRef: imperative handle that
  // must persist across renders without triggering re-renders.
  const cancelSignalRef = useRef(null);

  // Expose current state values to async callbacks without stale closures.
  // These refs are updated every render so async functions can read latest values.
  const stateRef = useRef({});
  stateRef.current = {
    bedSelect, desc, regionInfo, pathInfo, tracks, bedFile, region, name,
    dataType, fileSizeAlert, uploadInProgress, error, availableTracks,
    availableBeds, simplify, removeSequences, popupOpen,
  };

  function handleFetchError(err, message) {
    if (!cancelSignalRef.current?.aborted) {
      console.log(message, err.name, err.message);
      setError(err);
    } else {
      console.log(
        "fetch canceled by unmount",
        err.name,
        err.message
      );
    }
  }

  function getRegionDescByCoords(coords, rInfo) {
    const ri = rInfo ?? stateRef.current.regionInfo;
    for (let i = 0; i < ri["chr"]?.length ?? 0; i++) {
      if (coords === regionStringFromRegionIndex(i, ri)) {
        return ri["desc"]?.[i] ?? null;
      }
    }
    return null;
  }

  async function getBedRegions(bedFileArg) {
    setError(null);
    try {
      const json = await APIInterface.getBedRegions(bedFileArg, cancelSignalRef.current);
      if (!json.bedRegions || !(json.bedRegions["desc"] instanceof Array)) {
        throw new Error(
          "Server did not send back an array of BED region descriptions"
        );
      }
      const currentBedFile = stateRef.current.bedFile;
      if (currentBedFile === bedFileArg) {
        console.log("Apply retrieved BED regions");
        const newRegionInfo = json.bedRegions ?? {};
        setRegionInfo(newRegionInfo);
        setDesc(getRegionDescByCoords(stateRef.current.region, newRegionInfo));
      } else {
        console.log("Discard stale BED regions for " + bedFileArg + " because we are now looking at " + currentBedFile);
      }
    } catch (err) {
      handleFetchError(err, `API getBedRegions failed:`);
    }
  }

  async function getPathInfo(graphFile) {
    if (graphFile === null) return;
    setError(null);
    try {
      const json = await APIInterface.getPathInfo(graphFile, cancelSignalRef.current);
      if (!Array.isArray(json.pathInfo)) {
        throw new Error("Server did not send back an array of path info");
      }
      const laterGraphTrack = firstGraphTrack(stateRef.current.tracks);
      if (laterGraphTrack && laterGraphTrack.trackFile === graphFile) {
        setPathInfo(json.pathInfo);
      }
    } catch (err) {
      handleFetchError(err, "API getPathInfo failed:");
    }
  }

  async function getMountedFilenames() {
    setError(null);
    try {
      const json = await APIInterface.getFilenames(cancelSignalRef.current);
      if (!json.files || json.files.length === 0) {
        const err =
          json.error || "Server did not return a list of mounted filenames.";
        setError(err);
      } else {
        json.bedFiles.unshift("none");

        let availableTrackSet = makeAvailableTrackSet(json.files);

        const currentDataType = stateRef.current.dataType;
        const currentBedFile = stateRef.current.bedFile;
        const currentTracks = stateRef.current.tracks;

        if (currentDataType !== dataTypes.EXAMPLES) {
          const resolvedBedFile = (isValidURL(currentBedFile) || json.bedFiles.includes(currentBedFile))
            ? currentBedFile
            : "none";
          if (isSet(resolvedBedFile)) {
            console.log("Get BED regions for available BED file");
            getBedRegions(resolvedBedFile);
          } else {
            console.log("Don't get BED regions for BED", currentBedFile);
          }

          let graphTrack = firstGraphTrack(currentTracks);
          if (graphTrack) {
            if (trackIsImplied(graphTrack, availableTrackSet)) {
              console.log("Don't get path info for implied track:", graphTrack);
            } else {
              console.log("Get path info for track:", graphTrack);
              getPathInfo(graphTrack.trackFile);
            }
          }
        }

        setAvailableTracks(trackListWithImplied(json.files, availableTrackSet, currentTracks));
        setAvailableBeds(json.bedFiles);

        if (currentDataType === dataTypes.CUSTOM) {
          const currentBedSelect = stateRef.current.bedSelect;
          const newBedSelect = (isValidURL(currentBedSelect) || json.bedFiles.includes(currentBedSelect))
            ? currentBedSelect
            : "none";
          setBedSelect(newBedSelect);
          setBedFile(isSet(newBedSelect) ? newBedSelect : undefined);
          if (!isSet(newBedSelect)) {
            setRegionInfo({});
            setDesc(undefined);
          }
        }
      }
    } catch (err) {
      handleFetchError(err, `API getFilenames failed:`);
    }
  }

  function initState() {
    const ds = defaultViewTarget ?? DATA_SOURCES[0];
    const newBedSelect = isSet(ds.bedFile) ? ds.bedFile : "none";
    setTracks(ds.tracks);
    setBedFile(ds.bedFile);
    setBedSelect(newBedSelect);
    setRegion(ds.region);
    setDataType(ds.dataType);
    setName(ds.name);
    setSimplify(ds.simplify);
    setPopupOpen(false);
    setRemoveSequences(ds.removeSequences);
  }

  useEffect(() => {
    const controller = new AbortController();
    cancelSignalRef.current = controller.signal;

    initState();
    getMountedFilenames();
    APIInterface.subscribeToFilenameChanges(getMountedFilenames, controller.signal);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getNextViewTarget() {
    return {
      tracks,
      bedFile,
      name,
      region,
      dataType,
      simplify: simplify && !readsExist(tracks),
      removeSequences,
    };
  }

  function handleGoButton() {
    console.log("HANDLING GO BUTTON:");
    if (dataOrigin !== dataOriginTypes.API) {
      setColorSetting("haplotypeColors", "ygreys");
      setColorSetting("forwardReadColors", "reds");
    }

    const nextViewTarget = getNextViewTarget();
    const currViewTarget = getCurrentViewTarget();

    if (Object.keys(nextViewTarget["tracks"]).length === 0) {
      console.log("Tracks must not be empty before go");
      return;
    }

    if (!viewTargetsEqual(currViewTarget, nextViewTarget)) {
      setCurrentViewTarget(nextViewTarget);
    }
  }

  function getRegionCoordsByDesc(descArg, rInfo) {
    const ri = rInfo ?? stateRef.current.regionInfo;
    if (!ri["desc"]) {
      return null;
    }
    const i = ri["desc"].findIndex((d) => d === descArg);
    if (i === -1) return null;
    return regionStringFromRegionIndex(i, ri);
  }

  function convertArrayToObject(array) {
    let obj = {};
    for (let i = 0; i < array.length; i++) {
      obj[i] = array[i];
    }
    return obj;
  }

  async function handleRegionChange(coords) {
    setRegion(coords);
    setDesc(getRegionDescByCoords(coords, stateRef.current.regionInfo));

    let coordsToMetaData = {};

    const currentRegionInfo = stateRef.current.regionInfo;
    if (currentRegionInfo && !isEmpty(currentRegionInfo)) {
      for (const [index, path] of currentRegionInfo["chr"].entries()) {
        const pathWithRegion =
          path +
          ":" +
          currentRegionInfo.start[index] +
          "-" +
          currentRegionInfo.end[index];
        coordsToMetaData[pathWithRegion] = {
          tracks: currentRegionInfo.tracks[index],
          chunk: currentRegionInfo.chunk[index],
        };
      }
    }

    let newTracks = coordsToMetaData?.[coords]?.tracks ?? null;
    const chunk = coordsToMetaData?.[coords]?.chunk ?? null;

    const currentBedFile = stateRef.current.bedFile;
    if (!newTracks && isSet(currentBedFile) && chunk) {
      const json = await APIInterface.getChunkTracks(
        currentBedFile,
        chunk,
        cancelSignalRef.current
      );
      if (json.tracks) {
        console.log("json tracks: ", json.tracks);
        newTracks = json.tracks;
      }
    }

    if (newTracks) {
      let trackObject = convertArrayToObject(newTracks);
      let newGraphTrack = firstGraphTrack(trackObject);
      const laterRegion = stateRef.current.region;
      if (laterRegion === coords) {
        const currentAvailableTracks = stateRef.current.availableTracks;
        const laterGraphTrack = firstGraphTrack(stateRef.current.tracks);
        let availableTrackSet = makeAvailableTrackSet(currentAvailableTracks);
        setTracks(trackObject);
        setAvailableTracks(trackListWithImplied(currentAvailableTracks, availableTrackSet, trackObject));
        if (!newGraphTrack || !laterGraphTrack || newGraphTrack.trackFile !== laterGraphTrack.trackFile) {
          setPathInfo([]);
        }
      }

      const currentTracksNow = stateRef.current.tracks;
      let currentGraphTrack = firstGraphTrack(currentTracksNow);
      if (!newGraphTrack || !currentGraphTrack || newGraphTrack.trackFile !== currentGraphTrack.trackFile) {
        let availableTrackSet = makeAvailableTrackSet(stateRef.current.availableTracks);
        if (newGraphTrack && !trackIsImplied(newGraphTrack, availableTrackSet)) {
          console.log("Get path info for chunk provided graph track:", newGraphTrack);
          getPathInfo(newGraphTrack.trackFile);
        }
      }
    }
  }

  function handleInputChange(newTracks) {
    let newGraphTrack = firstGraphTrack(newTracks);
    const laterGraphTrack = firstGraphTrack(stateRef.current.tracks);

    setTracks(newTracks);
    if (!newGraphTrack || !laterGraphTrack || newGraphTrack.trackFile !== laterGraphTrack.trackFile) {
      setPathInfo([]);
    }

    let currentGraphTrack = firstGraphTrack(stateRef.current.tracks);
    if (!newGraphTrack || !currentGraphTrack || newGraphTrack.trackFile !== currentGraphTrack.trackFile) {
      let availableTrackSet = makeAvailableTrackSet(stateRef.current.availableTracks);
      if (newGraphTrack && !trackIsImplied(newGraphTrack, availableTrackSet)) {
        console.log("Get path info for newly selected graph track:", newGraphTrack);
        getPathInfo(newGraphTrack.trackFile);
      }
    }
  }

  function handleBedChange(event) {
    const id = event.target.id;
    const value = event.target.value;

    if (id === "bedSelect") {
      setBedSelect(value);
    }

    const currentBedFile = stateRef.current.bedFile;
    setBedFile(value);
    if (value !== currentBedFile) {
      console.log("Clearing outdated BED regions");
      setRegionInfo({});
      setDesc(undefined);
    }

    if (isSet(value) && value !== currentBedFile) {
      getBedRegions(value);
    }
  }

  async function budgeRegion(fraction) {
    let parsedRegion = parseRegion(stateRef.current.region);

    if (parsedRegion.distance !== undefined) {
      let shift = parsedRegion.distance * fraction;
      parsedRegion.start = Math.max(0, Math.round(parsedRegion.start + shift));
    } else {
      let shift = (parsedRegion.end - parsedRegion.start) * fraction;
      parsedRegion.start = Math.max(0, Math.round(parsedRegion.start + shift));
      parsedRegion.end = Math.max(0, Math.round(parsedRegion.end + shift));
    }

    await handleRegionChange(stringifyRegion(parsedRegion));
    handleGoButton();
  }

  async function jumpRegion(offset) {
    let regionIndex = determineRegionIndex(stateRef.current.region, stateRef.current.regionInfo) ?? 0;
    if ((offset === -1 && canGoLeft(regionIndex)) || (offset === 1 && canGoRight(regionIndex))) {
      regionIndex += offset;
    }
    let regionString = regionStringFromRegionIndex(regionIndex, stateRef.current.regionInfo);
    await handleRegionChange(regionString);
    handleGoButton();
  }

  function canGoLeft(regionIndex) {
    if (isSet(stateRef.current.bedFile)) {
      return (regionIndex > 0);
    } else {
      return true;
    }
  }

  function canGoRight(regionIndex) {
    if (isSet(stateRef.current.bedFile)) {
      if (!stateRef.current.regionInfo["chr"]) {
        return false;
      }
      return (regionIndex < ((stateRef.current.regionInfo["chr"].length) - 1));
    } else {
      return true;
    }
  }

  function handleGoRight() {
    if (isSet(bedFile)) {
      jumpRegion(1);
    } else {
      budgeRegion(0.5);
    }
  }

  function handleGoLeft() {
    if (isSet(bedFile)) {
      jumpRegion(-1);
    } else {
      budgeRegion(-0.5);
    }
  }

  function handleDataSourceChange(event) {
    const value = event.target.value;

    if (value === dataTypes.CUSTOM_FILES) {
      setBedSelect("none");
      setDesc("");
      setRegionInfo({});
      setPathInfo([]);
      setTracks({});
      setBedFile("none");
      setRegion("");
      setName(undefined);
      setDataType(dataTypes.CUSTOM_FILES);
      setFileSizeAlert(false);
      setUploadInProgress(false);
      setError(null);
    } else if (value === dataTypes.EXAMPLES) {
      setDataType(dataTypes.EXAMPLES);
    } else {
      DATA_SOURCES.forEach((ds) => {
        if (ds.name === value) {
          let newBedSelect = "none";
          if (isSet(ds.bedFile)) {
            getBedRegions(ds.bedFile);
            newBedSelect = ds.bedFile;
          } else {
            setRegionInfo({});
          }
          let graphTrack = firstGraphTrack(ds.tracks);
          if (graphTrack) {
            console.log("Get path info for built-in track: ", graphTrack);
            getPathInfo(graphTrack.trackFile);
          }

          const laterGraphTrack = firstGraphTrack(stateRef.current.tracks);
          if (!laterGraphTrack || !graphTrack || laterGraphTrack.trackFile !== graphTrack.trackFile) {
            setPathInfo([]);
          }

          setTracks(ds.tracks);
          setBedFile(ds.bedFile);
          setBedSelect(newBedSelect);
          setRegion(ds.region);
          setDataType(dataTypes.BUILT_IN);
          setName(ds.name);
        }
      });
    }
  }

  async function handleFileUpload(fileType, file) {
    if (!(APIInterface instanceof LocalAPI) && file.size > config.MAXUPLOADSIZE) {
      setFileSizeAlert(true);
      return;
    }

    setUploadInProgress(true);

    try {
      let fileName = await APIInterface.putFile(fileType, file, cancelSignalRef.current);
      if (fileType === "graph") {
        getMountedFilenames();
      }
      setUploadInProgress(false);
      return fileName;
    } catch (e) {
      if (!cancelSignalRef.current?.aborted) {
        setUploadInProgress(false);
        throw e;
      }
    }
  }

  let errorDiv = null;
  if (error) {
    const message = error.message ? error.message : error;
    errorDiv = (
      <div>
        <Container fluid={true}>
          <Row>
            <Alert color="danger">{message}</Alert>
          </Row>
        </Container>
      </div>
    );
  }

  const dataSourceDropdownOptions = [
    ...DATA_SOURCES.map((ds) => ({ value: ds.name, label: ds.name })),
    { value: dataTypes.EXAMPLES, label: "synthetic data examples" },
    { value: dataTypes.CUSTOM_FILES, label: "custom" },
  ];
  const dataSourceValue = dataType === dataTypes.BUILT_IN ? (name ?? "") : dataType;

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES;
  const examplesFlag = dataType === dataTypes.EXAMPLES;
  const viewTargetHasChange = !viewTargetsEqual(
    getNextViewTarget(),
    getCurrentViewTarget()
  );
  const displayDescription = desc;

  const regionIndex = determineRegionIndex(region, regionInfo);

  const DataPositionFormRowComponent = (
    <DataPositionFormRow
      handleGoLeft={() => handleGoLeft()}
      handleGoRight={() => handleGoRight()}
      handleGoButton={() => handleGoButton()}
      uploadInProgress={uploadInProgress}
      getCurrentViewTarget={getCurrentViewTarget}
      viewTargetHasChange={viewTargetHasChange}
      canGoLeft={canGoLeft(regionIndex)}
      canGoRight={canGoRight(regionIndex)}
    />
  );

  return (
    <div>
      <Container>
        <Row>
          <Col>{errorDiv}</Col>
        </Row>
        <Row>
          <Col md="auto">
            <img src="./logo.png" alt="Logo" />
          </Col>
          <Col>
            <Label
              className="tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
              htmlFor="dataSourceSelect"
            >
              Data:
            </Label>
            <MuiSelect
              id="dataSourceSelect"
              data-testid="dataSourceSelect"
              size="small"
              fullWidth
              value={dataSourceValue}
              onChange={(e) => handleDataSourceChange(e)}
            >
              {dataSourceDropdownOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </MuiSelect>
            &nbsp;
            {customFilesFlag && (
              <React.Fragment>
                <Label
                  htmlFor="bedSelectInput"
                  className="customData tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
                >
                  BED:
                </Label>
                &nbsp;
                <BedFileDropdown
                  className="customDataMounted dropdown mb-2 me-sm-4 mb-sm-0"
                  id="bedSelect"
                  inputId="bedSelectInput"
                  value={bedSelect}
                  onChange={(e) => handleBedChange(e)}
                  options={availableBeds}
                />
                &nbsp;
              </React.Fragment>
            )}
            {!examplesFlag && (
              <RegionInput
                pathNames={pathInfo.map((p) => p.name)}
                regionInfo={regionInfo}
                handleRegionChange={(coords) => handleRegionChange(coords)}
                region={region}
              />
            )}

            {customFilesFlag && (
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  {DataPositionFormRowComponent}
                </div>
                <div className="d-flex justify-content-end align-items-start flex-shrink-0">
                  {(
                    <>
                      <Button
                        onClick={() => setPopupOpen(!popupOpen)}
                        outline
                        active={simplify || removeSequences}
                      >
                        <FontAwesomeIcon icon={faGear} /> Simplify
                      </Button>
                      <PopupDialog open={popupOpen} close={() => setPopupOpen(!popupOpen)} width="400px">
                        <div style={{ height: "10vh" }}>
                          <label className="d-flex align-items-center justify-content-between" style={{ marginBottom: "10px" }}>
                            <span>Remove Small Variants</span>
                            <Switch onChange={() => setSimplify(!simplify)} checked={simplify} />
                          </label>
                          <label className="d-flex align-items-center justify-content-between">
                            <span>Remove Node Sequences</span>
                            <Switch onChange={() => setRemoveSequences(!removeSequences)} checked={removeSequences} />
                          </label>
                        </div>
                      </PopupDialog>
                    </>
                  )}
                  <TrackPicker
                    tracks={tracks}
                    availableTracks={availableTracks}
                    onChange={(newTracks) => handleInputChange(newTracks)}
                    handleFileUpload={async (fileType, file) => handleFileUpload(fileType, file)}
                  ></TrackPicker>
                </div>
              </div>
            )}
            <Row>
              <Alert
                color="danger"
                isOpen={fileSizeAlert}
                toggle={() => { setFileSizeAlert(false); }}
                className="mt-3"
              >
                <strong>File size too big! </strong>
                You may only upload files with a maximum size of{" "}
                {MAX_UPLOAD_SIZE_DESCRIPTION}.
              </Alert>

              {examplesFlag ? (
                <ExampleSelectButtons
                  setDataOrigin={setDataOrigin}
                  setColorSetting={setColorSetting}
                />
              ) : (
                !customFilesFlag && DataPositionFormRowComponent
              )}
            </Row>
            {displayDescription ? (
              <div style={{ marginTop: "10px" }}>
                <FormHelperText> {"Region Description: "} </FormHelperText>
                <FormHelperText style={{ fontWeight: "bold" }}>
                  {desc}
                </FormHelperText>
              </div>
            ) : null}
          </Col>
        </Row>
        {pathInfo.length > 0 && !examplesFlag && (
          <Row>
            <Col>
              <PathsPanel
                pathInfo={pathInfo}
                onLoadPath={async (region) => { await handleRegionChange(region); handleGoButton(); }}
              />
            </Col>
          </Row>
        )}
      </Container>
    </div>
  );
}

export default HeaderForm;
