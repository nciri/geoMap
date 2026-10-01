import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "./components";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, a[href]";

// A modal window: the page behind is inert to the pointer, Tab stays inside, Escape closes and
// focus goes back to whatever opened it.
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first =
      box.current?.querySelector<HTMLElement>("input, select, textarea") ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <header className="dialog__head">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <IconButton icon="close" label="Fermer" tooltip="Fermer" onClick={onClose} />
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}
