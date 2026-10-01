import { render, screen } from "@testing-library/react";
import { CoordinateReadout } from "./CoordinateReadout";

it("shows MGRS and lat/lon for the cursor position", () => {
  render(<CoordinateReadout position={{ lng: 2.29448, lat: 48.85837 }} />);
  expect(screen.getByText(/^31U /)).toBeInTheDocument();
  expect(screen.getByText("48.85837° N 2.29448° E")).toBeInTheDocument();
  expect(screen.getByText("MGRS")).toHaveClass("al-coords__k");
});

it("invites the user to hover the map before any position is known", () => {
  render(<CoordinateReadout position={null} />);
  expect(screen.getByText("Survolez la carte")).toBeInTheDocument();
});

it("does not announce every cursor move to screen readers", () => {
  const { container } = render(<CoordinateReadout position={{ lng: 2.29448, lat: 48.85837 }} />);
  expect(container.querySelector("[aria-live]")).toBeNull();
});
