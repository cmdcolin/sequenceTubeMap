import React from "react";
import PropTypes from "prop-types";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

const PALETTE_OPTIONS = [
  { value: "plainColors", label: "Plain" },
  { value: "reds", label: "Reds" },
  { value: "blues", label: "Blues" },
  { value: "greys", label: "Greys" },
  { value: "ygreys", label: "Yellow-greys" },
  { value: "lightColors", label: "Light" },
];

const PANEL_STYLE = {
  padding: "8px 12px",
  border: "1px solid #d0d0d0",
  background: "#fafafa",
  borderRadius: "4px",
  margin: "8px 0",
  fontSize: "14px",
};

const HEADER_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "6px",
  fontWeight: 500,
};

const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 0",
};

const SWATCH_STYLE = {
  width: "24px",
  height: "20px",
  border: "1px solid #888",
  borderRadius: "3px",
  padding: 0,
  cursor: "pointer",
};

const NAME_INPUT_STYLE = {
  border: "1px solid transparent",
  background: "transparent",
  fontSize: "14px",
  padding: "2px 4px",
  borderRadius: "3px",
  minWidth: "120px",
};

const COUNT_STYLE = {
  color: "#666",
  fontSize: "13px",
};

const DELETE_STYLE = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: "16px",
  color: "#666",
  padding: "0 4px",
};

function isSolid(color) {
  return typeof color === "string" && color.startsWith("#");
}

const OTHER_LABEL_STYLE = {
  fontSize: "14px",
  padding: "2px 4px",
  color: "#444",
  fontStyle: "italic",
  minWidth: "120px",
};

const OTHER_ROW_STYLE = {
  ...ROW_STYLE,
  borderTop: "1px dashed #ccc",
  marginTop: "4px",
  paddingTop: "8px",
};

const ReadGroupsPanel = ({
  groups,
  activeGroupId,
  otherReadsColor,
  onSetActive,
  onRename,
  onRecolor,
  onDelete,
  onRecolorOther,
}) => {
  const otherSolid = isSolid(otherReadsColor);
  return (
  <div style={PANEL_STYLE}>
    <div style={HEADER_STYLE}>
      Read coloring
      <span style={COUNT_STYLE}>
        ({groups.length} group{groups.length === 1 ? "" : "s"} + other)
      </span>
    </div>
    {groups.map((group) => {
      const isActive = group.id === activeGroupId;
      const solid = isSolid(group.color);
      return (
        <div key={group.id} style={ROW_STYLE}>
          <input
            type="radio"
            name="active-read-group"
            checked={isActive}
            onChange={() => onSetActive(group.id)}
            aria-label={`Set ${group.name} as active group`}
            title="Active group receives new selections"
          />
          <Select
            size="small"
            value={solid ? "__solid__" : group.color}
            onChange={(e) => {
              const v = e.target.value;
              onRecolor(group.id, v === "__solid__" ? "#ff7f00" : v);
            }}
            aria-label={`Palette for ${group.name}`}
            title="Choose a palette (reads cycle through it) or solid color"
            sx={{ fontSize: "13px", minWidth: 120 }}
          >
            {PALETTE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
            <MenuItem value="__solid__">Solid color…</MenuItem>
          </Select>
          {solid ? (
            <input
              type="color"
              value={group.color}
              style={SWATCH_STYLE}
              onChange={(e) => onRecolor(group.id, e.target.value)}
              aria-label={`Solid color for ${group.name}`}
            />
          ) : null}
          <input
            type="text"
            value={group.name}
            style={{
              ...NAME_INPUT_STYLE,
              borderColor: isActive ? "#888" : "transparent",
            }}
            onChange={(e) => onRename(group.id, e.target.value)}
            aria-label={`Name for ${group.name}`}
          />
          <span style={COUNT_STYLE}>
            {group.reads.length} read{group.reads.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            style={DELETE_STYLE}
            onClick={() => onDelete(group.id)}
            aria-label={`Delete group ${group.name}`}
            title="Delete group"
          >
            ×
          </button>
        </div>
      );
    })}
    <div style={OTHER_ROW_STYLE}>
      <span style={{ width: "16px" }} />
      <Select
        size="small"
        value={otherSolid ? "__solid__" : otherReadsColor}
        onChange={(e) => {
          const v = e.target.value;
          onRecolorOther(v === "__solid__" ? "#888888" : v);
        }}
        aria-label="Palette for other reads"
        title="Color for reads not in any group"
        sx={{ fontSize: "13px", minWidth: 120 }}
      >
        {PALETTE_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
        <MenuItem value="__solid__">Solid color…</MenuItem>
      </Select>
      {otherSolid ? (
        <input
          type="color"
          value={otherReadsColor}
          style={SWATCH_STYLE}
          onChange={(e) => onRecolorOther(e.target.value)}
          aria-label="Solid color for other reads"
        />
      ) : null}
      <span style={OTHER_LABEL_STYLE}>Other reads (ungrouped)</span>
    </div>
  </div>
  );
};

ReadGroupsPanel.propTypes = {
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      color: PropTypes.string.isRequired,
      reads: PropTypes.arrayOf(PropTypes.string).isRequired,
    })
  ).isRequired,
  activeGroupId: PropTypes.string,
  otherReadsColor: PropTypes.string.isRequired,
  onSetActive: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onRecolor: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onRecolorOther: PropTypes.func.isRequired,
};

export default ReadGroupsPanel;
