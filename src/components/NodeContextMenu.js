import React from "react";
import PropTypes from "prop-types";
import ContextMenu from "./ContextMenu";

const NodeContextMenu = ({
  nodeName,
  readNames,
  alreadyInNodeSet,
  x,
  y,
  onAddReadsToSet,
  onAddNodeToNodeSet,
  onClose,
}) => {
  const count = readNames.length;
  return (
    <ContextMenu
      header={`Node: ${nodeName}`}
      x={x}
      y={y}
      onClose={onClose}
      items={[
        {
          label:
            count === 0
              ? "No reads through this node"
              : `Add ${count} read${count === 1 ? "" : "s"} through this node to read set`,
          disabled: count === 0,
          onClick: () => onAddReadsToSet(readNames),
        },
        {
          label: alreadyInNodeSet
            ? "Already in node set"
            : "Add this node to node set",
          disabled: alreadyInNodeSet,
          onClick: () => onAddNodeToNodeSet(nodeName),
        },
      ]}
    />
  );
};

NodeContextMenu.propTypes = {
  nodeName: PropTypes.string.isRequired,
  readNames: PropTypes.arrayOf(PropTypes.string).isRequired,
  alreadyInNodeSet: PropTypes.bool.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  onAddReadsToSet: PropTypes.func.isRequired,
  onAddNodeToNodeSet: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NodeContextMenu;
