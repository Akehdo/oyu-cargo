import { useEffect, useState } from "react";
import { usePersistedState } from "./usePersistedState";
import {
  insideTelegram,
  onTelegramEvent,
  setChromeColors,
  telegramColorScheme,
} from "../telegram/miniApp";

export type ThemeMode = "dark" | "light";
export type ThemePreference = ThemeMode | "system";

const THEME_STORAGE_KEY = "cargo.client.theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** Inside Telegram "system" means the Telegram theme, not the phone's. */
function getSystemTheme(): ThemeMode {
  const telegram = telegramColorScheme();
  if (telegram) return telegram;
  try {
    return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * Theme follows the OS (`prefers-color-scheme`) until the user picks one
 * explicitly; the choice is persisted in localStorage.
 */
export function useTheme(): {
  theme: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
} {
  const [stored, setStored] = usePersistedState<ThemePreference | null>(
    THEME_STORAGE_KEY,
    null,
  );
  const preference: ThemePreference =
    stored === "light" || stored === "dark" ? stored : "system";
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(LIGHT_QUERY);
    } catch {
      return undefined;
    }

    const onChange = () => setSystemTheme(getSystemTheme());
    media.addEventListener("change", onChange);
    const offTelegram = onTelegramEvent("theme_changed", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      offTelegram();
    };
  }, []);

  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0e0e0e" : "#ffffff");
    if (insideTelegram()) {
      const background = theme === "dark" ? "#0e0e0e" : "#f7f5f2";
      // The tab bar is always black, so Telegram's bottom bar is too.
      setChromeColors({ background, bottomBar: "#0e0e0e", header: background });
    }
  }, [theme]);

  return {
    theme,
    preference,
    setPreference: (next) => setStored(next === "system" ? null : next),
    toggle: () => setStored(theme === "dark" ? "light" : "dark"),
  };
}
