import { render, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegionInput from "./RegionInput";
const handleRegionChangeMock = vi.fn();
const MOCK_REGIONS = {
  chr: ["pathy", "anotherPath", "node", "chr600"],
  chunk: ["", "", "", ""],
  desc: ["desc1", "desc2", "desc3", "desc4"],
  start: [1, 2, 3, 4],
  end: [10, 20, 30, 40],
};
const INIT_REGION = "";
const makeRegionInput = (region) => (
  <RegionInput
    region={region}
    regionInfo={MOCK_REGIONS}
    handleRegionChange={handleRegionChangeMock}
  />
);
const renderMockRegion = () => {
  // Render RegionInput to virtual DOM
  let mockInput = makeRegionInput(INIT_REGION);
  return render(mockInput);
};

test("it renders expected options for given props", () => {
  renderMockRegion();

  // Select autocomplete
  const autocomplete = screen.getByTestId("autocomplete");

  const input = autocomplete.querySelector("input");

  autocomplete.focus();
  fireEvent.click(input);
  // Key down to ensure options show up
  fireEvent.keyDown(autocomplete, { key: "ArrowDown" });

  expect(screen.getAllByRole("option")).toHaveLength(MOCK_REGIONS.chr.length);
});
test("it calls handleRegionChange when region is changed with new region", async () => {
  // Ensure region is added when it's not part of the option list

  const { rerender } = renderMockRegion();

  handleRegionChangeMock.mockImplementation((region) =>
    rerender(makeRegionInput(region))
  );
  // Select autocomplete
  const input = screen.getByRole("combobox", { name: /Region/i });

  fireEvent.click(input);

  expect(input.value).toEqual(INIT_REGION);

  const NEW_REGION = "newPath:0-10";
  await userEvent.clear(input);
  await userEvent.type(input, NEW_REGION);

  expect(handleRegionChangeMock).toHaveBeenLastCalledWith(
    NEW_REGION
  );
});
