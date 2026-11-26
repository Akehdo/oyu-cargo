import { useEffect, useRef } from "react";
import { pushBackHandler } from "./miniApp";

/** Shows Telegram's native back button while `active`; modals use a higher priority. */
export function useTelegramBackButton(active: boolean, onBack: () => void, priority = 0): void {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    return pushBackHandler(() => latest.current(), priority);
  }, [active, priority]);
}
