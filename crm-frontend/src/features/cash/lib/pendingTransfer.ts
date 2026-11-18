import { paymentTypeLabels } from "../../records/types";
import type { CashTransferPayload } from "../types";

export type PendingTransfer = { key: string; payload: CashTransferPayload };
const pendingBySession = new Map<string, PendingTransfer | null>();
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const pendingTransferHistoryField = "oyu.cash.pendingTransfer";

export function newTransferKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function parseTransfer(raw: string | null): PendingTransfer | null {
  try {
    if (!raw) return null;
    const pending: PendingTransfer = JSON.parse(raw);
    const { amount, from_payment_type, to_payment_type } = pending.payload;
    if (
      !uuidV4.test(pending.key) ||
      !Number.isFinite(amount) || amount <= 0 || from_payment_type === to_payment_type ||
      !Object.prototype.hasOwnProperty.call(paymentTypeLabels, from_payment_type) ||
      !Object.prototype.hasOwnProperty.call(paymentTypeLabels, to_payment_type)
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

function historyTransfer(storageKey: string): string | null {
  try {
    const entry = window.history.state?.[pendingTransferHistoryField];
    return entry?.storageKey === storageKey && typeof entry.value === "string" ? entry.value : null;
  } catch {
    return null;
  }
}

export function readPendingTransfer(storageKey: string): PendingTransfer | null {
  if (pendingBySession.has(storageKey)) return pendingBySession.get(storageKey) ?? null;
  const saved = parseTransfer(historyTransfer(storageKey));
  if (saved) return saved;
  try {
    return parseTransfer(sessionStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function storePendingTransfer(storageKey: string, pending: PendingTransfer): boolean {
  const serialized = JSON.stringify(pending);
  // An existing history fallback takes precedence, including after a reload.
  if (!historyTransfer(storageKey)) {
    try {
      if (sessionStorage.getItem(storageKey) !== serialized) {
        sessionStorage.setItem(storageKey, serialized);
      }
      if (sessionStorage.getItem(storageKey) === serialized) {
        pendingBySession.set(storageKey, pending);
        return true;
      }
    } catch {
      // Private browsing and storage quotas can block Web Storage.
    }
  }
  try {
    if (historyTransfer(storageKey) !== serialized) {
      const state = window.history.state;
      if (state !== null && Object.getPrototypeOf(state) !== Object.prototype) return false;
      window.history.replaceState({
        ...state, [pendingTransferHistoryField]: { storageKey, value: serialized },
      }, "");
      if (historyTransfer(storageKey) !== serialized) return false;
    }
    pendingBySession.set(storageKey, pending);
    return true;
  } catch {
    return false;
  }
}

export function clearPendingTransfer(storageKey: string, key: string): void {
  if (readPendingTransfer(storageKey)?.key !== key) return;
  pendingBySession.set(storageKey, null);
  try {
    if (parseTransfer(historyTransfer(storageKey))?.key === key) {
      const state = { ...window.history.state };
      delete state[pendingTransferHistoryField];
      window.history.replaceState(state, "");
    }
  } catch {
    // A restored entry will replay the same idempotency key.
  }
  try {
    if (parseTransfer(sessionStorage.getItem(storageKey))?.key === key) {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    // The history fallback can be used while Web Storage is blocked.
  }
}
