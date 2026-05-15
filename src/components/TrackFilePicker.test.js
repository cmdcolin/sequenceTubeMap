import React from "react";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrackFilePicker } from "./TrackFilePicker";

function openAutocomplete(component) {
  const input = within(component).getByRole("combobox");
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  return input;
}

describe("TrackFilePicker", () => {
  const testTracks = [
    { trackFile: "fileA1.vg", trackType: "graph" },
    { trackFile: "fileA2.gbwt", trackType: "haplotype" },
    { trackFile: "fileB1.gbwt", trackType: "haplotype" },
    { trackFile: "fileB2.gam", trackType: "read" },
    { trackFile: "fileC1.xg", trackType: "graph" },
  ];

  it("should render without errors", async () => {
    const fakeOnChange = vi.fn();
    const { getByPlaceholderText } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"graph"}
        pickerType={"mounted"}
        handleInputChange={fakeOnChange}
      />
    );

    expect(getByPlaceholderText("Select a file")).toBeTruthy();
  });

  it("should allow value to be controlled", async () => {
    const fakeOnChange = vi.fn();
    const { getByDisplayValue, rerender } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"graph"}
        pickerType={"mounted"}
        value={"fileA1.vg"}
        handleInputChange={fakeOnChange}
      />
    );

    expect(getByDisplayValue("fileA1.vg")).toBeTruthy();

    rerender(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"graph"}
        pickerType={"mounted"}
        value={"fileC1.xg"}
        handleInputChange={fakeOnChange}
      />
    );

    expect(getByDisplayValue("fileC1.xg")).toBeTruthy();
  });

  it("should call onChange when an option is selected", async () => {
    const fakeOnChange = vi.fn();
    const { queryByTestId, findByRole } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"haplotype"}
        pickerType={"mounted"}
        handleInputChange={fakeOnChange}
      />
    );

    const fileSelectComponent = queryByTestId("file-select-component");
    const input = openAutocomplete(fileSelectComponent);

    fireEvent.click(await findByRole("option", { name: "fileB1.gbwt" }));

    expect(fakeOnChange).toHaveBeenCalledTimes(1);
    expect(fakeOnChange).toHaveBeenCalledWith("fileB1.gbwt");

    fireEvent.change(input, { target: { value: "" } });
    openAutocomplete(fileSelectComponent);
    fireEvent.click(await findByRole("option", { name: "fileA2.gbwt" }));

    expect(fakeOnChange).toHaveBeenCalledTimes(2);
    expect(fakeOnChange).toHaveBeenCalledWith("fileA2.gbwt");
  });

  it("should call onChange when queried by input value", async () => {
    const fakeOnChange = vi.fn();
    const { queryByTestId, findByRole } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"graph"}
        pickerType={"mounted"}
        handleInputChange={fakeOnChange}
      />
    );

    const fileSelectComponent = queryByTestId("file-select-component");
    const input = openAutocomplete(fileSelectComponent);

    fireEvent.change(input, { target: { value: "fileC1" } });
    fireEvent.click(await findByRole("option", { name: "fileC1.xg" }));

    expect(fakeOnChange).toHaveBeenCalledTimes(1);
    expect(fakeOnChange).toHaveBeenCalledWith("fileC1.xg");
  });

  it("should call call handleFileUpload when a file is inputted", async () => {
    const fakeOnChange = vi.fn();
    const fakeHandleFileUpload = vi.fn();

    const { queryByTestId } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType={"graph"}
        pickerType={"upload"}
        handleInputChange={fakeOnChange}
        handleFileUpload={fakeHandleFileUpload}
      />
    );

    const fakeFile = new File(["example_data"], "example.vg", {
      type: "text/vg",
    });

    const fileSelectComponent = queryByTestId("file-select-component");

    await userEvent.upload(fileSelectComponent, fakeFile);

    expect(fakeHandleFileUpload).toHaveBeenCalledTimes(1);
    expect(fileSelectComponent.files.length).toBe(1);
    expect(fileSelectComponent.files[0]).toStrictEqual(fakeFile);
  });
});
