import CreatableSelect from "react-select/creatable";

function getFilename(fullPath) {
  const segments = fullPath.split("/");
  return segments[segments.length - 1];
}

/**
 * A searchable selection dropdown component.
 * Expects a two-way-binding where "value" is the selected value (out of the
 * array in "options"), and calling "onChange" with an event-like object
 * updates the value.
 *
 * The onChange argument is meant to look enough like a DOM change event on a
 * "real" <select> to fool most people. It is an object with a "target"
 * property, which then has an "id" property with this component's "id" prop,
 * and a "value" property with the new value.
 */
export function BedFileDropdown({ id, inputId, className, value, onChange, options }) {
  const styles = {
    control: (base) => ({ ...base, minHeight: "unset", height: "calc(2.25rem - 2px)" }),
    valueContainer: (base) => ({
      ...base,
      width: Math.max(...options.map((option) => option.length)) * 8 + 16,
      minWidth: "48px",
      position: "unset",
    }),
    indicatorsContainer: (base) => ({ ...base, height: "inherit" }),
    menu: (base) => ({ ...base, width: "max-content", minWidth: "100%", zIndex: 999 }),
  };

  const dropdownOptions = options.map((option) => ({ label: getFilename(option), value: option }));

  const handleChange = (option) => {
    onChange({ target: { id, value: option.value } });
  };

  return (
    <CreatableSelect
      getNewOptionData={(inputValue, optionLabel) => ({ label: optionLabel, value: inputValue })}
      id={id}
      inputId={inputId}
      className={className}
      value={dropdownOptions.find((option) => option.value === value) || { label: getFilename(value), value }}
      styles={styles}
      isSearchable={true}
      onChange={handleChange}
      options={dropdownOptions}
      getOptionValue={(o) => o["value"]}
      openMenuOnClick={dropdownOptions.length < 2000}
    />
  );
}

export default BedFileDropdown;
