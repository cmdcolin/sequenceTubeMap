import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import React from "react";
import "../config-client.js";
import { config } from "../config-global.mjs";
import { Input } from "reactstrap";

/*
 * A selection dropdown component that select files.
 * Expects a collection of track objects in the form of {"name": string, "type": string}
 *
 * The handleInputChange function expects to be passed a bare value.
 *
 * See demo and test file for examples of this component.
 */

//handleInputChange takes in a string trackType
export const TrackFilePicker = ({
  tracks, // array of available tracks
  fileType = "graph", // e.g read, gam, graph
  value, // input file
  handleInputChange,
  pickerType = "mounted", // either "dropdown or upload" to determine which component we render
  className = undefined,
  testID = "file-select-component",
  handleFileUpload,
}) => {
  let uploadFileInput = React.createRef();
  let acceptedExtensions = config.fileTypeToExtensions[fileType];

  async function uploadOnChange() {
    // TODO: we have a ref here for a reason, but the ref's value can be null
    // when the upload await finishes. So we capture it to a local.
    const uploadingInput = uploadFileInput.current;
    const file = uploadingInput.files[0];
    
    try {
      const completePath = await handleFileUpload(fileType, file);
      console.log("TrackFilePicker got an upload result:", completePath);
      // This will be nothing if the upoload was canceled.
      handleInputChange(completePath);
    } catch (e) {
      console.error("TrackFilePicker could not upload: ", e);
      // TODO: Display error to user in a better way
      alert(e.toString());
      // Clear out the uploaded file to show it didn't work.
      uploadingInput.value = null; 
    }
  }

  function mountedOnChange(option) {
    // update parent state
    value = option.value;
    handleInputChange(option.value);
  }

  function getFilename(fullPath) {
    const segments = fullPath.split("/");
    return segments[segments.length - 1];
  }
  
  // Make the list of all options for the <Select>
  let allOptions = [];
  // And the currently selected one
  let currentOption = null;
  for (const track of tracks) {
    if (track.trackType === fileType) {
      // This track could get selected so make an object for the Select.
      let trackOption = {label: getFilename(track.trackFile), value: track.trackFile};
      if (track.trackIsImplied) {
        // Make this file look different because it's not actually in the API
        trackOption.label = "(?) " + trackOption.label;
      }
      allOptions.push(trackOption);
      if (trackOption.value === value) {
        // This one should be the selected one.
        currentOption = trackOption;
      }
    }
  }
  if (currentOption === null) {
    // We didn't find an option that matches what's currently selected.
    if (value === undefined) {
      // Because we're in a special nothing-is-selected state. Make a placeholder to represent that.
      currentOption = {label: "Select a file", value: undefined};
    } else {
      // We're *supposed* to always be given one.
      // Make an even more implied option.
      console.warn("Value " + value + " not found in available tracks:", tracks);
      currentOption = {label: "(!) " + getFilename(value), value: value};
    }
  }
  
  if (pickerType === "mounted") {
    const placeholderActive = value === undefined;
    return (
      <div data-testid={testID}>
        <Autocomplete
          options={allOptions}
          value={placeholderActive ? null : currentOption}
          size="small"
          disableClearable
          isOptionEqualToValue={(o, v) => o.value === v.value}
          getOptionLabel={(o) => o.label ?? ""}
          onChange={(_event, newValue) => {
            if (newValue) mountedOnChange(newValue);
          }}
          className={className}
          sx={{ minWidth: 240 }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={placeholderActive ? "Select a file" : undefined}
            />
          )}
        />
      </div>
    );
  } else if (pickerType === "upload") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginTop: 5,
        }}
      >
        <Input
          data-testid={testID}
          type="file"
          className="customDataUpload form-control-file"
          accept={acceptedExtensions}
          innerRef={uploadFileInput}
          onChange={uploadOnChange}
        />
      </div>
    );
  } else {
    throw new Error("Invalid picker type");
  }
};


export default TrackFilePicker;
