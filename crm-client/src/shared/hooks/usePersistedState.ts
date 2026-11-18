import { Dispatch, SetStateAction, useEffect, useState } from "react";

export function usePersistedState<TValue>(
  key: string,
  initialValue: TValue,
): [TValue, Dispatch<SetStateAction<TValue>>] {
  const [value, setValue] = useState<TValue>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as TValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable (private mode); keep the in-memory value.
    }
  }, [key, value]);

  return [value, setValue];
}
