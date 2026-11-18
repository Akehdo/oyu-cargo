import { Moon, Sun } from "lucide-react";

export type ThemeMode = "dark" | "light";

type ThemeToggleProps = {
  theme: ThemeMode;
  onChange: (theme: ThemeMode) => void;
  className?: string;
};

export function ThemeToggle({
  theme,
  onChange,
  className = "",
}: ThemeToggleProps): JSX.Element {
  return (
    <button
      className={`icon-button ${className}`.trim()}
      type="button"
      title={theme === "dark" ? "Светлая тема" : "Темная тема"}
      onClick={() => onChange(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
