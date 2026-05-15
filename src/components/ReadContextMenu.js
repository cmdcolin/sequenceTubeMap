import React from "react";
import PropTypes from "prop-types";
import ContextMenu from "./ContextMenu";

const ReadContextMenu = ({
  readName,
  x,
  y,
  alreadyInSet,
  onFilter,
  onAddToSet,
  onClose,
}) => (
  <ContextMenu
    header={`Read: ${readName}`}
    x={x}
    y={y}
    onClose={onClose}
    items={[
      {
        label: "Show only this read",
        onClick: () => onFilter(readName),
      },
      {
        label: alreadyInSet ? "Already in filter set" : "Add to filter set",
        disabled: alreadyInSet,
        onClick: () => onAddToSet(readName),
      },
    ]}
  />
);

ReadContextMenu.propTypes = {
  readName: PropTypes.string.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  alreadyInSet: PropTypes.bool.isRequired,
  onFilter: PropTypes.func.isRequired,
  onAddToSet: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ReadContextMenu;
