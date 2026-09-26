import { render, screen } from "@testing-library/react";
import { CoordinateReadout } from "./CoordinateReadout";

it("shows MGRS and lat/lon for the cursor position", () => {
  render(<CoordinateReadout position={{ lng: 2.29448, lat: 48.85837 }} />);
  expect(screen.getByText(/^31U /)).toBeInTheDocument();
  expect(screen.getByText("48.85837° N 2.29448° E")).toBeInTheDocument();
});

it("invites the user to hover the map before any position is known", () => {
  render(<CoordinateReadout position={null} />);
  expect(screen.getByText("Survolez la carte")).toBeInTheDocument();
});
