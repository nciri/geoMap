import { Outlet, useLocation } from "react-router";
import { useSession } from "./auth/AuthProvider";
import { Sidebar, useSidebarCollapsed, type NavItem } from "./ui/Sidebar";
import { SiteHeader } from "./ui/SiteHeader";
import { UserMenu } from "./ui/UserMenu";

function titleOf(pathname: string): string {
  if (pathname.startsWith("/missions/")) return "Mission";
  if (pathname.startsWith("/admin/terminaux")) return "Terminaux";
  if (pathname.startsWith("/admin/fonds")) return "Fonds de carte";
  return "Missions";
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function Layout() {
  const { name, roles, signOut } = useSession();
  const { pathname } = useLocation();
  const [collapsed, toggle] = useSidebarCollapsed(
    pathname.startsWith("/missions/") ? "editor" : "pages",
  );
  const planner = roles.includes("planificateur");
  const admin = roles.includes("administrateur");
  const items: NavItem[] = [
    ...(planner
      ? [{ id: "missions", label: "Missions", icon: "missions" as const, href: "/" }]
      : []),
    ...(admin
      ? [
          {
            id: "terminaux",
            label: "Terminaux",
            icon: "terminals" as const,
            href: "/admin/terminaux",
          },
          { id: "fonds", label: "Fonds de carte", icon: "basemaps" as const, href: "/admin/fonds" },
        ]
      : []),
  ];
  const role = [planner && "Planificateur", admin && "Administrateur"].filter(Boolean).join(" · ");
  return (
    <div className="shell">
      <Sidebar items={items} collapsed={collapsed} onToggle={toggle} />
      <div className="shell__main">
        <SiteHeader title={titleOf(pathname)}>
          <UserMenu user={{ initials: initials(name), name, role }} onSignOut={signOut} />
        </SiteHeader>
        <Outlet />
      </div>
    </div>
  );
}
