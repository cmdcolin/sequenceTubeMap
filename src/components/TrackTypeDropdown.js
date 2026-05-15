import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

export function TrackTypeDropdown({
  id = undefined,
  className = undefined,
  value = "graph",
  onChange,
  testID = "file-type-select-component",
  options = ["graph", "haplotype", "read", "node"],
}) {
  return (
    <div data-testid={testID}>
      <Select
        id={id}
        className={className}
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </Select>
    </div>
  );
}


export default TrackTypeDropdown;
