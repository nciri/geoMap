import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawToolbar } from "./DrawToolbar";

it("offers every drawing tool and marks the active one", async () => {
  const onMode = vi.fn();
  render(<DrawToolbar mode="polygon" onMode={onMode} />);
  expect(screen.getByRole("button", { name: "Zone" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(screen.getByRole("button", { name: "Cercle" }));
  expect(onMode).toHaveBeenCalledWith("circle");
  await userEvent.click(screen.getByRole("button", { name: "Ligne" }));
  expect(onMode).toHaveBeenCalledWith("linestring");
  await userEvent.click(screen.getByRole("button", { name: "Terminer" }));
  expect(onMode).toHaveBeenCalledWith("static");
});

it("keeps every tool disabled until the map can draw", () => {
  render(<DrawToolbar mode="static" onMode={vi.fn()} disabled />);
  for (const name of ["Point", "Ligne", "Zone", "Cercle", "Terminer"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
});
