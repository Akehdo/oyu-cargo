import { ReactNode } from "react";
import { ThemeMode, ThemeToggle } from "../shared/components/ThemeToggle";

type PublicShellProps = {
  children: ReactNode;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
};

export function PublicShell({
  children,
  theme,
  onThemeChange,
}: PublicShellProps): JSX.Element {
  return (
    <div className="app-shell public-shell">
      <ThemeToggle
        className="theme-button"
        theme={theme}
        onChange={onThemeChange}
      />
      {children}
    </div>
  );
}
