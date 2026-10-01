import type { ReactNode } from "react";

export function SiteHeader({
  title,
  user,
  children,
}: {
  title: string;
  user: { initials: string; name: string; role: string };
  children?: ReactNode;
}) {
  return (
    <header className="al-header">
      <h1 className="al-header__title">{title}</h1>
      <div className="al-header__spacer" />
      {children}
      <div className="al-header__user">
        <span className="al-avatar" aria-hidden="true">
          {user.initials}
        </span>
        <span>
          {user.name}
          <br />
          <span className="al-header__role">{user.role}</span>
        </span>
      </div>
    </header>
  );
}
