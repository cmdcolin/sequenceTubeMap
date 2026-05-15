import React from "react";
import { render, waitFor } from "@testing-library/react";
import { TrackSettingsButton } from "./TrackSettingsButton";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("TrackSettingsButton", () => {
  it("opens popup", async () => {
    render(
      <TrackSettingsButton
        fileType="graph"
        trackColorSettings={{
          mainPalette: "blues",
          auxPalette: "reds",
          colorReadsByMappingQuality: false,
          alphaReadsByMappingQuality: false,
        }}
        setTrackColorSetting={function (a, b) {}}
      ></TrackSettingsButton>
    );

    await userEvent.click(screen.getByTestId("settings-button-component"));

    expect(screen.getByRole("heading")).toBeTruthy();

    await userEvent.click(screen.getByTestId("PopupDialogCloseButton"));

    await waitFor(() => {
      expect(screen.queryByRole("heading")).toBeFalsy();
    });
  });
});
