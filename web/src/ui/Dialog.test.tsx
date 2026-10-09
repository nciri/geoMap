import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      {open && (
        <Dialog title="Nouvelle mission" onClose={() => setOpen(false)}>
          <input aria-label="Nom" />
          <button>Valider</button>
        </Dialog>
      )}
    </>
  );
}

it("opens as a named modal with focus on its first field", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Ouvrir" }));
  const dialog = screen.getByRole("dialog", { name: "Nouvelle mission" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(screen.getByRole("textbox", { name: "Nom" })).toHaveFocus();
});

it("keeps Tab inside and gives focus back on Escape", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Ouvrir" }));
  await user.tab();
  await user.tab();
  expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Nom" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Ouvrir" })).toHaveFocus();
});

it("closes from its close button and from a click on the backdrop", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Ouvrir" }));
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Ouvrir" }));
  await user.click(document.querySelector(".dialog-backdrop")!);
  expect(screen.queryByRole("dialog")).toBeNull();
});
