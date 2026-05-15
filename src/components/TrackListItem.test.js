import React from "react";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/react";
import { TrackListItem } from "./TrackListItem";
describe("TrackListItem", () => {
  const trackFile = undefined;
  const trackType = "graph";
  const availableColors = [
    "greys",
    "ygreys",
    "reds",
    "plainColors",
    "lightColors",
  ];
  const availableTracks = [
    { trackFile: "fileA1.vg", trackType: "graph" },
    { trackFile: "fileA2.gbwt", trackType: "haplotype" },
    { trackFile: "fileB1.gbwt", trackType: "haplotype" },
    { trackFile: "fileB2.gam", trackType: "read" },
    { trackFile: "fileC1.xg", trackType: "graph" },
  ];
  const trackColorSettings = {
    mainPalette: "blues",
    auxPalette: "reds",
    colorReadsByMappingQuality: false,
    alphaReadsByMappingQuality: false,
  };

  it("should render without errors", async () => {
    const fakeOnChange = vi.fn();
    const fakeOnDelete = vi.fn();
    const { getByText, getByRole } = render(
      <TrackListItem
        trackProps={{
          trackFile: trackFile,
          trackType: trackType,
          trackColorSettings: trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
      />
    );

    expect(getByRole("button", { name: /Settings/i })).toBeTruthy();
    expect(getByText("graph")).toBeTruthy();
    expect(screen.getByPlaceholderText("Select a file")).toBeTruthy();
  });

  it("should call onChange correctly", async () => {
    const fakeOnChange = vi.fn();
    const fakeOnDelete = vi.fn();

    const { getByText, queryByTestId, rerender } = render(
      <TrackListItem
        trackProps={{
          trackFile: trackFile,
          trackType: trackType,
          trackColorSettings: trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
      />
    );

    expect(fakeOnChange).toHaveBeenCalledTimes(0);

    // change track type
    const fileTypeSelectComponent = queryByTestId(
      "file-type-select-component1"
    );
    fireEvent.mouseDown(within(fileTypeSelectComponent).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "haplotype" }));

    expect(fakeOnChange).toHaveBeenCalledTimes(1);

    // simulate onchange rerendering component
    rerender(
      <TrackListItem
        trackProps={{
          trackFile: trackFile,
          trackType: "haplotype",
          trackColorSettings: trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
      />
    );

    // change file name
    const fileSelectComponent = queryByTestId("file-select-component1");
    const fileInput = within(fileSelectComponent).getByRole("combobox");
    fileInput.focus();
    fireEvent.keyDown(fileInput, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "fileB1.gbwt" }));

    expect(fakeOnChange).toHaveBeenCalledTimes(2);
    expect(fakeOnChange).toHaveBeenCalledWith(1, {
      trackFile: "fileB1.gbwt",
      trackType: "haplotype",
      trackColorSettings: trackColorSettings,
    });

    rerender(
      <TrackListItem
        trackProps={{
          trackFile: "fileB1.gbwt",
          trackType: "haplotype",
          trackColorSettings: trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
      />
    );

    // change color settings
    fireEvent.click(queryByTestId("settings-button-component1"));
    await waitFor(() => getByText("reds"));
    fireEvent.click(getByText("reds"));
    fireEvent.click(document);

    expect(fakeOnChange).toHaveBeenCalledTimes(3);
  });

  it("should call onDelete correctly", async () => {
    const fakeOnChange = vi.fn();
    const fakeOnDelete = vi.fn();
    const { queryByTestId } = render(
      <TrackListItem
        trackProps={{
          trackFile: trackFile,
          trackType: trackType,
          trackColorSettings: trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
      />
    );

    expect(fakeOnDelete).toHaveBeenCalledTimes(0);

    fireEvent.click(queryByTestId("delete-button-component1"));
    expect(fakeOnDelete).toHaveBeenCalledTimes(1);
  });
});
