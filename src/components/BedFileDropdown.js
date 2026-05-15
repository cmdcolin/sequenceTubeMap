import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

function getFilename(fullPath) {
  const segments = fullPath.split("/");
  return segments[segments.length - 1];
}

export function BedFileDropdown({ id, inputId, className, value, onChange, options }) {
  return (
    <Autocomplete
      id={id}
      className={className}
      size="small"
      freeSolo
      disableClearable
      value={value ?? ""}
      options={options}
      getOptionLabel={(option) => getFilename(option)}
      onChange={(_event, newValue) => {
        onChange({ target: { id, value: newValue ?? "" } });
      }}
      onInputChange={(_event, newInput, reason) => {
        if (reason === "input") {
          onChange({ target: { id, value: newInput } });
        }
      }}
      renderInput={(params) => (
        <TextField {...params} inputProps={{ ...params.inputProps, id: inputId }} />
      )}
      sx={{ minWidth: 200, display: "inline-block" }}
    />
  );
}

export default BedFileDropdown;
