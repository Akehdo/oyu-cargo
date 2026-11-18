import type { ClientNotification } from "../../../shared/api/types";

const SEEN_STORAGE_KEY = "cargo.client.notifications.seen";
const MAX_SEEN_IDS = 300;

export type BrowserPermission = NotificationPermission | "unsupported";

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserPermission(): BrowserPermission {
  return isBrowserNotificationSupported()
    ? Notification.permission
    : "unsupported";
}

export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  const result = await Notification.requestPermission();
  if (result === "granted") {
    void getServiceWorkerRegistration();
  }
  return result;
}

/** Ids already processed by polling, shared between tabs via localStorage. */
export function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function rememberSeenIds(ids: string[]): void {
  if (!ids.length) {
    return;
  }

  const seen = Array.from(getSeenIds());
  for (const id of ids) {
    if (!seen.includes(id)) {
      seen.push(id);
    }
  }

  try {
    localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify(seen.slice(-MAX_SEEN_IDS)),
    );
  } catch {
    // Ignore storage errors.
  }
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * A tiny service worker (public/sw.js) is needed on Android Chrome, where
 * `new Notification()` is not allowed and only `registration.showNotification` works.
 */
export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    const base = import.meta.env.BASE_URL;
    registrationPromise = navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }

  return registrationPromise;
}

export async function showBrowserNotification(
  notification: ClientNotification,
): Promise<void> {
  if (getBrowserPermission() !== "granted") {
    return;
  }

  const body = notification.body ?? notification.track_number ?? "";
  const options: NotificationOptions = {
    body,
    tag: notification.id,
    icon: `${import.meta.env.BASE_URL}favicon.svg`,
  };

  try {
    const registration = await getServiceWorkerRegistration();
    if (registration) {
      await registration.showNotification(notification.title, options);
      return;
    }
  } catch {
    // Fall back to the page-level API below.
  }

  try {
    const instance = new Notification(notification.title, options);
    instance.onclick = () => {
      window.focus();
      instance.close();
    };
  } catch {
    // Some mobile browsers do not allow notifications outside a service worker.
  }
}
