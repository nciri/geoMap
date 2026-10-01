import { render, screen } from "@testing-library/react";
import { Alert, Button, Icon, iconNames, Logo, MapPanel, StatusBadge } from "./components";

it("draws every icon of the set, decorative unless titled", () => {
  expect(iconNames).toHaveLength(64);
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.innerHTML).not.toBe("");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    unmount();
  }
  render(<Icon name="missions" title="Missions" />);
  expect(screen.getByRole("img", { name: "Missions" })).toBeInTheDocument();
});

it("renders buttons in their variants, as plain buttons by default", () => {
  render(
    <>
      <Button variant="primary">Publier</Button>
      <Button variant="irreversible">Révoquer</Button>
      <Button disabled>Importer</Button>
      <Button type="submit">Envoyer</Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Publier" })).toHaveClass("al-btn", "al-btn--primary");
  expect(screen.getByRole("button", { name: /Révoquer/ })).toHaveClass("al-btn--irreversible");
  expect(screen.getByRole("button", { name: "Importer" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publier" })).toHaveAttribute("type", "button");
  expect(screen.getByRole("button", { name: "Envoyer" })).toHaveAttribute("type", "submit");
});

it("labels states in French by default", () => {
  render(
    <>
      <StatusBadge state="ok" />
      <StatusBadge state="revoked" />
      <StatusBadge state="blocked">Brouillon</StatusBadge>
    </>,
  );
  expect(screen.getByText("Sain")).toHaveClass("al-status", "al-status--ok");
  expect(screen.getByText("Révoqué")).toHaveClass("al-status--revoked");
  expect(screen.getByText("Brouillon")).toHaveClass("al-status--blocked");
});

it("announces errors as alerts and the rest as status", () => {
  render(
    <>
      <Alert
        severity="error"
        title="Import refusé"
        who={{ role: "Administrateur", step: "réimporter" }}
      >
        Fichier tronqué.
      </Alert>
      <Alert title="Chargement…" />
    </>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Import refusé");
  expect(screen.getByRole("alert")).toHaveTextContent("Administrateur · réimporter");
  expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
});

it("names the logo and floats map panels", () => {
  render(
    <>
      <Logo appName="geoMap" />
      <MapPanel className="x">contenu</MapPanel>
    </>,
  );
  expect(screen.getByRole("img", { name: "ALIAS geoMap" })).toBeInTheDocument();
  expect(screen.getByText("contenu")).toHaveClass("al-mappanel", "x");
});
