import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { ICONS, LOGO_PATHS, type IconName } from "./icons";

export type { IconName };
export const iconNames = Object.keys(ICONS) as IconName[];
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function Icon({
  name,
  size = 20,
  title,
  className,
}: {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("al-icon", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      // Static markup from ICONS only; no user data reaches it.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

// The design system's own inks; #ffffff is its "white" tone for dark grounds.
const TONES = {
  color: ["var(--brand-orange)", "var(--brand-orange)"],
  duo: ["var(--brand-navy)", "var(--brand-orange)"],
  white: ["#ffffff", "var(--brand-orange)"],
  mono: ["currentColor", "currentColor"],
  auto: ["var(--text)", "var(--brand-orange)"],
} as const;
type Tone = keyof typeof TONES;

function Mark({ tone, size }: { tone: Tone; size: number }) {
  const mask = "alias-cut-" + useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [ink, orbit] = TONES[tone];
  return (
    <svg
      viewBox="12 14 72 72"
      width={size}
      height={size}
      aria-hidden="true"
      className="al-logo__mark"
    >
      <defs>
        {/* Mask channels: white keeps, black cuts the gap between the A and the orbit. */}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path
            d={LOGO_PATHS.SWOOSH}
            fill="#000"
            stroke="#000"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <path d={LOGO_PATHS.A} fill={ink} mask={`url(#${mask})`} />
      <path d={LOGO_PATHS.SWOOSH} fill={orbit} />
      <g fill={orbit}>
        <ellipse cx="74.9" cy="35.1" rx="3" ry="2.1" transform="rotate(-40 74.9 35.1)" />
        <circle cx="78.5" cy="32.2" r="0.9" />
      </g>
    </svg>
  );
}

const WORD_INKS: Record<Tone, string> = {
  white: "#ffffff",
  duo: "var(--brand-navy)",
  mono: "currentColor",
  color: "var(--text)",
  auto: "var(--text)",
};

export function Logo({
  variant = "lockup",
  tone = "auto",
  size = 32,
  appName,
}: {
  variant?: "lockup" | "mark" | "app-icon";
  tone?: Tone;
  size?: number;
  appName?: string;
}) {
  const label = appName ? `ALIAS ${appName}` : "ALIAS";
  if (variant === "app-icon") {
    return (
      <span
        className="al-logo al-logo--app"
        style={{ width: size, height: size }}
        role="img"
        aria-label={label}
      >
        <Mark tone="color" size={size * 0.78} />
      </span>
    );
  }
  return (
    <span className={cx("al-logo", `al-logo--${variant}`)} role="img" aria-label={label}>
      <Mark tone={tone} size={size} />
      {variant === "lockup" && (
        <span className="al-logo__words" style={{ color: WORD_INKS[tone] }}>
          <span className="al-logo__name" style={{ fontSize: size * 0.5 }}>
            ALIAS
            {appName && <span className="al-logo__app"> · {appName}</span>}
          </span>
        </span>
      )}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "irreversible";
  touch?: boolean;
  icon?: IconName;
};

export function Button({
  variant = "secondary",
  touch = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "al-btn",
        variant !== "secondary" && `al-btn--${variant}`,
        touch && "al-btn--touch",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export type State = "ok" | "degraded" | "error" | "pending" | "unknown" | "revoked" | "blocked";
const STATE_LABELS: Record<State, string> = {
  ok: "Sain",
  degraded: "Dégradé",
  error: "En erreur",
  pending: "En attente",
  unknown: "Inconnu",
  revoked: "Révoqué",
  blocked: "Bloqué",
};

export function StatusBadge({
  state = "unknown",
  children,
}: {
  state?: State;
  children?: ReactNode;
}) {
  return <span className={`al-status al-status--${state}`}>{children ?? STATE_LABELS[state]}</span>;
}

const ALERT_ICONS = {
  error: "error",
  degraded: "degraded",
  unknown: "unknown",
  info: "info",
} as const;

export function Alert({
  severity = "info",
  title,
  time,
  children,
  who,
}: {
  severity?: keyof typeof ALERT_ICONS;
  title: string;
  time?: string;
  children?: ReactNode;
  who?: { role: string; step: string };
}) {
  return (
    <div
      className={cx("al-alert", severity !== "info" && `al-alert--${severity}`)}
      role={severity === "error" ? "alert" : "status"}
    >
      <span className="al-alert__glyph">
        <Icon name={ALERT_ICONS[severity]} size={18} />
      </span>
      <span className="al-alert__title">{title}</span>
      {time ? <span className="al-alert__time">{time}</span> : <span />}
      {children && <span className="al-alert__body">{children}</span>}
      {who && (
        <span className="al-alert__who">
          <b>{who.role}</b> · {who.step}
        </span>
      )}
    </div>
  );
}

export function MapPanel({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={cx("al-mappanel", className)} style={style}>
      {children}
    </div>
  );
}
