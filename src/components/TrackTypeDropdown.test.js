import React from "react";
import { render, fireEvent, screen, within } from "@testing-library/react";
import { TrackTypeDropdown } from "./TrackTypeDropdown";

describe("TrackTypeDropdown", () => {
  it("calls the onChange callback handler", async () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TrackTypeDropdown value="haplotype" onChange={onChange} />
    );
    const combobox = within(getByTestId("file-type-select-component")).getByRole("combobox");
    fireEvent.mouseDown(combobox);
    const option = await screen.findByRole("option", { name: "graph" });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("graph");
  });
});
