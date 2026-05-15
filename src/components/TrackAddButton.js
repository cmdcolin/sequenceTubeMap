import React from "react";
import { Button } from "reactstrap";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// Component in TrackListDisplay, adds new track item into TrackList when pressed
export const TrackAddButton = ({ onChange, testID = "track-add-button-component" }) => {
  return (
    <Button
      aria-label="TrackAdd"
      onClick={onChange}
      data-testid={testID}
      style={{ width: "40px", marginLeft: "25px", marginTop: "5px" }}
    >
      <FontAwesomeIcon icon={faPlus} />
    </Button>
  );
};


export default TrackAddButton;
