import React from "react";
import PropTypes from "prop-types";
import ContextMenu from "./ContextMenu";

const NodeContextMenu = ({
  nodeName,
  readNames,
  alreadyInNodeSet,
  x,
  y,
  activeGroup,
  onAddReadsToSet,
  onAddReadsToActiveGroup,
  onAddNodeToNodeSet,
  onClose,
}) => {
  const count = readNames.length;
  const items = [
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
  ];
  if (activeGroup && count > 0) {
    items.push({
      label: `Add ${count} read${count === 1 ? "" : "s"} to "${activeGroup.name}"`,
      onClick: () => onAddReadsToActiveGroup(readNames),
    });
  }
  return (
    <ContextMenu
      header={`Node: ${nodeName}`}
      x={x}
      y={y}
      onClose={onClose}
      items={items}
    />
  );
};

NodeContextMenu.propTypes = {
  nodeName: PropTypes.string.isRequired,
  readNames: PropTypes.arrayOf(PropTypes.string).isRequired,
  alreadyInNodeSet: PropTypes.bool.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  activeGroup: PropTypes.shape({
    name: PropTypes.string.isRequired,
  }),
  onAddReadsToSet: PropTypes.func.isRequired,
  onAddReadsToActiveGroup: PropTypes.func.isRequired,
  onAddNodeToNodeSet: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NodeContextMenu;
