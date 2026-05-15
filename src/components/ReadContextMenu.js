import React from "react";

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

const ReadContextMenu = ({ readName, x, y, onFilter, onClose }) => (
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
      <div
        style={ITEM_STYLE}
        onClick={() => onFilter(readName)}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#eef")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Show only this read
      </div>
    </div>
  </>
);


export default ReadContextMenu;
