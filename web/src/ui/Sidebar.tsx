import { useState } from "react";
import { NavLink } from "react-router";
import { Icon, Logo, type IconName } from "./components";

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
}

type Context = "editor" | "pages";
const DEFAULTS: Record<Context, boolean> = { editor: true, pages: false };

function readCollapsed(context: Context): boolean {
  try {
    const stored = localStorage.getItem(`geomap.sidebar.${context}`);
    return stored === null ? DEFAULTS[context] : stored === "collapsed";
  } catch {
    return DEFAULTS[context];
  }
}

export function useSidebarCollapsed(context: Context): [boolean, () => void] {
  const [choices, setChoices] = useState(() => ({
    editor: readCollapsed("editor"),
    pages: readCollapsed("pages"),
  }));
  const collapsed = choices[context];
  const toggle = () => {
    try {
      localStorage.setItem(`geomap.sidebar.${context}`, collapsed ? "expanded" : "collapsed");
    } catch {
      // Not remembered, nothing else to do.
    }
    setChoices({ ...choices, [context]: !collapsed });
  };
  return [collapsed, toggle];
}

export function Sidebar({
  items,
  collapsed,
  onToggle,
}: {
  items: NavItem[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <nav
      className={collapsed ? "al-sidebar al-sidebar--collapsed" : "al-sidebar"}
      aria-label="Navigation principale"
    >
      <div className="al-sidebar__brand">
        <Logo variant={collapsed ? "mark" : "lockup"} size={28} appName="geoMap" />
      </div>
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.href}
          end={item.href === "/"}
          className="al-nav"
          title={collapsed ? item.label : undefined}
        >
          <span className="al-nav__icon">
            <Icon name={item.icon} />
          </span>
          {/* Hidden visually when collapsed, never from assistive technology. */}
          <span className={collapsed ? "al-sr" : "al-nav__label"}>{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="al-nav al-nav--toggle"
        onClick={onToggle}
        aria-label={collapsed ? "Déplier" : "Replier"}
      >
        <span className="al-nav__icon">
          <Icon name="collapse" />
        </span>
        {!collapsed && <span className="al-nav__label">Replier</span>}
      </button>
    </nav>
  );
}
