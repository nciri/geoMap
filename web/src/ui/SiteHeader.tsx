import type { ReactNode } from "react";

export function SiteHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="al-header">
      <h1 className="al-header__title">{title}</h1>
      <div className="al-header__spacer" />
      {children}
    </header>
  );
}
