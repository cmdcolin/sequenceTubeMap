import React from "react";
import PropTypes from "prop-types";

const BACKDROP_STYLE = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
};

const MENU_STYLE = {
  position: "fixed",
  zIndex: 1000,
  background: "white",
  border: "1px solid #888",
  borderRadius: "4px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  padding: "4px 0",
  minWidth: "200px",
  fontSize: "14px",
};

const HEADER_STYLE = {
  padding: "4px 12px",
  color: "#666",
  fontSize: "12px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "300px",
};

const ITEM_STYLE = {
  padding: "6px 12px",
  cursor: "pointer",
  userSelect: "none",
};

const DISABLED_ITEM_STYLE = {
  ...ITEM_STYLE,
  color: "#aaa",
  cursor: "default",
};

const MenuItem = ({ onClick, disabled, children }) =>
  disabled ? (
    <div style={DISABLED_ITEM_STYLE}>{children}</div>
  ) : (
    <div
      style={ITEM_STYLE}
      onClick={() => onClick()}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#eef")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </div>
  );

MenuItem.propTypes = {
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

const ReadContextMenu = ({
  readName,
  x,
  y,
  alreadyInSet,
  onFilter,
  onAddToSet,
  onClose,
}) => (
  <>
    <div
      style={BACKDROP_STYLE}
      onMouseDown={() => onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
    <div style={{ ...MENU_STYLE, left: x, top: y }}>
      <div style={HEADER_STYLE}>Read: {readName}</div>
      <MenuItem onClick={() => onFilter(readName)}>
        Show only this read
      </MenuItem>
      <MenuItem
        disabled={alreadyInSet}
        onClick={() => onAddToSet(readName)}
      >
        {alreadyInSet ? "Already in filter set" : "Add to filter set"}
      </MenuItem>
    </div>
  </>
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
