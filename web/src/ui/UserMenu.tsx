import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./components";
import { useTheme, type ThemePreference } from "./theme";

const THEMES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "Jour", icon: "sun" },
  { value: "dark", label: "Nuit", icon: "moon" },
  { value: "system", label: "Système", icon: "display" },
];

export function UserMenu({
  user,
  onSignOut,
}: {
  user: { initials: string; name: string; role: string };
  onSignOut: () => void;
}) {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(root.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") close();
    else if (event.key === "Tab") setOpen(false);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    }
  }

  return (
    <div className="user-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="al-avatar" aria-hidden="true">
          {user.initials}
        </span>
        <span className="user-menu__who">
          <span className="user-menu__name">{user.name}</span>
          <span className="al-header__role">{user.role}</span>
        </span>
        <Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <div className="user-menu__list" role="menu" id={menuId} aria-label="Compte">
          <div role="group" aria-label="Thème">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                type="button"
                role="menuitemradio"
                aria-checked={preference === theme.value}
                tabIndex={-1}
                className="user-menu__item"
                onClick={() => {
                  setPreference(theme.value);
                  close();
                }}
              >
                <Icon name={theme.icon} size={16} />
                {theme.label}
                {preference === theme.value && (
                  <Icon name="check" size={16} className="user-menu__check" />
                )}
              </button>
            ))}
          </div>
          <div className="user-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="user-menu__item"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <Icon name="logout" size={16} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
