import React from "react";
import PropTypes from "prop-types";
import Select from "react-select";

/**
 * A track type dropdown component.
 * Created using composition of functions approach.
 *
 * Expects a two-way-binding where "value" is the selected value (out of the
 * possible track types), and calling "onChange" updates the value.
 *
 */

// TODO: rename TrackTypeDropdown to be generalized dropdown component
export function TrackTypeDropdown({
  id = undefined,
  className = undefined,
  value = "graph",
  onChange,
  testID = "file-type-select-component",
  options = ["graph", "haplotype", "read", "node"],
  ...rest
}) {
  // dropdown and selections
  // upon selection of a dropdown option, call onChange function
  let dropdown = (
    <div data-testid={testID}>
      <Select
        id={id}
        className={className}
        value={{ label: value, value: value }}
        onChange={(o) => {
          onChange(o.value);
        }}
        options={options.map((o) => ({
          label: o,
          value: o,
        }))}
        {...rest}
      />
    </div>
  );

  return dropdown;
}

/* React checks for the type of each prop passed in to ensure that the correct type is being 
inputted to the component. For example, if 'id' is supposed to be a string, a number must not 
be passed in - that would cause errors. However, if the prop has 'isRequired' specified, 
it must be passed to the component. */

TrackTypeDropdown.propTypes = {
  id: PropTypes.string,
  className: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  testID: PropTypes.string,
  options: PropTypes.array,
};

export default TrackTypeDropdown;
