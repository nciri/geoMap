import { useTheme, type ThemePreference } from "./theme";

const CHOICES: [ThemePreference, string][] = [
  ["system", "Système"],
  ["dark", "Nuit"],
  ["light", "Jour"],
];

export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="al-modeswitch" role="group" aria-label="Thème">
      {CHOICES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
