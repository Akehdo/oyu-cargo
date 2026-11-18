import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../hooks/useTheme";

type ThemeToggleProps = {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
};

export function ThemeToggle({
  theme,
  onToggle,
  className = "",
}: ThemeToggleProps): JSX.Element {
  const title = theme === "dark" ? "Светлая тема" : "Тёмная тема";

  return (
    <button
      className={`icon-button ghost ${className}`.trim()}
      type="button"
      title={title}
      aria-label={title}
      onClick={onToggle}
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
