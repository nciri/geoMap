import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeSwitch } from "./ModeSwitch";

it("marks the current mode and switches", async () => {
  const onMode = vi.fn();
  render(<ModeSwitch mode="Carte" hasImagery onMode={onMode} />);
  expect(screen.getByRole("button", { name: "Carte" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Hybride" }));
  expect(onMode).toHaveBeenCalledWith("Hybride");
});

it("disables Satellite and Hybride without imagery", () => {
  render(<ModeSwitch mode="Carte" hasImagery={false} onMode={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Satellite" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Hybride" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Carte" })).toBeEnabled();
});
