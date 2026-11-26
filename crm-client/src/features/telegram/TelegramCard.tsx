import { BellRing, CheckCircle2, LoaderCircle, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "../../shared/api/http";
import { usePersistedState } from "../../shared/hooks/usePersistedState";
import {
  botWriteAccess,
  getInitData,
  haptic,
  isMiniApp,
  requestWriteAccess,
  WriteAccess,
} from "../../shared/telegram/miniApp";
import { useAuth } from "../auth/context/AuthContext";
import { useOptionalMe } from "../me/MeContext";

const ASKED_KEY = "oyu.telegram.writeAccessAsked";

/**
 * Connecting Telegram: inside the Mini App the open Telegram account is
 * linked directly (and the bot asks for permission to write); in a browser
 * the client gets a one-time t.me deep link to press "Start".
 */
export function useTelegramLink() {
  const { api } = useAuth();
  const meContext = useOptionalMe();
  const me = meContext?.me ?? null;
  const reload = meContext?.reload;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [writeAccess, setWriteAccess] = useState<WriteAccess>(botWriteAccess);
  const telegram = me?.telegram;
  const linked = Boolean(telegram?.linked);

  // The client confirms in the bot and comes back: refresh the status.
  useEffect(() => {
    if (!linkUrl || linked || !reload) return undefined;
    const onReturn = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [linkUrl, linked, reload]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught, "Не удалось выполнить действие"));
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  const allowMessages = async () => setWriteAccess(await requestWriteAccess());

  const connect = () =>
    run(async () => {
      const initData = getInitData();
      if (initData) {
        // Ask first, so the bot's confirmation message can reach the client.
        await allowMessages();
        await api("/client/telegram/link", { method: "POST", body: { init_data: initData } });
        haptic("success");
        await reload?.();
        return;
      }
      const { url } = await api<{ url: string }>("/client/telegram/link-url", { method: "POST" });
      setLinkUrl(url);
    });

  const disconnect = () =>
    run(async () => {
      await api("/client/telegram", { method: "DELETE" });
      setLinkUrl("");
      await reload?.();
    });

  return {
    allowMessages: () => run(allowMessages),
    busy,
    connect,
    disconnect,
    enabled: Boolean(telegram?.enabled),
    error,
    linked,
    linkUrl,
    /** The client declined the bot's request to write: notifications cannot arrive. */
    messagesBlocked: linked && isMiniApp() && writeAccess === "denied",
    username: telegram?.username ?? null,
  };
}

/**
 * Inside the Telegram Mini App a signed-in client is linked to the Telegram
 * account automatically, once per session; Telegram asks whether the bot
 * may send messages (once per Telegram session).
 */
export function TelegramAutoLink(): null {
  const { api } = useAuth();
  const meContext = useOptionalMe();
  const me = meContext?.me;
  const attempted = useRef(false);

  useEffect(() => {
    const initData = getInitData();
    if (!initData || !me?.telegram?.enabled || me.telegram.linked || attempted.current) return;
    attempted.current = true;
    const link = async () => {
      if (botWriteAccess() !== "allowed" && !sessionFlag(ASKED_KEY)) {
        setSessionFlag(ASKED_KEY);
        await requestWriteAccess();
      }
      await api("/client/telegram/link", { method: "POST", body: { init_data: initData } });
      await meContext?.reload();
    };
    link().catch(() => {
      // The profile card still offers to connect manually.
    });
  }, [api, me, meContext]);

  return null;
}

function sessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Private mode.
  }
}

/** Profile section: parcel status notifications through the OYU Cargo bot. */
export function TelegramCard(): JSX.Element | null {
  const link = useTelegramLink();
  if (!link.enabled) return null;

  return (
    <section className="card">
      <h2 className="section-title">Уведомления в Telegram</h2>
      {link.linked ? (
        <>
          <p className="telegram-status">
            <CheckCircle2 size={18} />
            Подключено{link.username ? ` · @${link.username}` : ""}
          </p>
          <p className="muted small">
            Бот OYU Cargo пишет, когда меняется статус ваших посылок и когда
            посылка ждёт выдачи.
          </p>
        </>
      ) : (
        <p className="muted small">
          Подключите Telegram — бот OYU Cargo будет сообщать об изменении
          статуса посылок и о прибытии в пункт выдачи.
        </p>
      )}

      <div className="telegram-actions">
        <MessagesBlockedHint link={link} />
        {link.linked ? (
          <button type="button" className="secondary-button" disabled={link.busy} onClick={() => void link.disconnect()}>
            {link.busy ? <LoaderCircle className="spin" size={18} /> : null}
            Отключить
          </button>
        ) : (
          <ConnectButton link={link} />
        )}
        {link.error ? <p className="alert">{link.error}</p> : null}
      </div>
    </section>
  );
}

type TelegramLink = ReturnType<typeof useTelegramLink>;

function ConnectButton({ link }: { link: TelegramLink }): JSX.Element {
  if (link.linkUrl) {
    return (
      <>
        <a className="primary-button" href={link.linkUrl} target="_blank" rel="noreferrer">
          <Send size={18} />
          Открыть бота в Telegram
        </a>
        <p className="field-hint muted">
          Нажмите «Старт» в боте и вернитесь сюда. Ссылка действует 15 минут.
        </p>
      </>
    );
  }
  return (
    <button type="button" className="primary-button" disabled={link.busy} onClick={() => void link.connect()}>
      {link.busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
      {isMiniApp() ? "Получать уведомления здесь" : "Подключить Telegram"}
    </button>
  );
}

function MessagesBlockedHint({ link }: { link: TelegramLink }): JSX.Element | null {
  if (!link.messagesBlocked) return null;
  return (
    <div className="telegram-blocked">
      <p className="small">
        Вы не разрешили боту писать вам — уведомления о посылках не придут.
      </p>
      <button type="button" className="secondary-button" disabled={link.busy} onClick={() => void link.allowMessages()}>
        <BellRing size={18} />
        Разрешить сообщения
      </button>
    </div>
  );
}

/**
 * Notification channel for the bell panel footer: Telegram when the bot is
 * configured (it works while the cabinet is closed), otherwise nothing.
 */
export function TelegramNotificationsFooter(): JSX.Element | null {
  const link = useTelegramLink();
  if (!link.enabled) return null;
  if (link.linked) {
    return (
      <>
        <MessagesBlockedHint link={link} />
        {link.messagesBlocked ? null : (
          <p className="muted small center telegram-footer-status">
            <Send size={14} /> Уведомления дублируются в Telegram
            {link.username ? ` · @${link.username}` : ""}
          </p>
        )}
      </>
    );
  }
  return (
    <div className="telegram-actions compact">
      <ConnectButton link={link} />
      {link.error ? <p className="alert">{link.error}</p> : null}
    </div>
  );
}

/** Home page prompt until the client connects Telegram or hides it. */
export function TelegramPromo(): JSX.Element | null {
  const link = useTelegramLink();
  const [hidden, setHidden] = usePersistedState<boolean>("oyu.telegram.promoHidden", false);
  const hide = useCallback(() => setHidden(true), [setHidden]);
  if (!link.enabled || link.linked || hidden) return null;

  return (
    <section className="card telegram-promo">
      <button type="button" className="icon-button ghost telegram-promo-close" aria-label="Скрыть" onClick={hide}>
        <X size={18} />
      </button>
      <div className="card-title">
        <span className="card-icon">
          <Send size={20} />
        </span>
        <div>
          <strong>Статус посылок в Telegram</strong>
          <p className="muted small">
            Бот сообщит, когда посылка отправлена из Китая, прибыла в Алматы и
            ждёт вас в Кокшетау.
          </p>
        </div>
      </div>
      <div className="telegram-actions">
        <ConnectButton link={link} />
        {link.error ? <p className="alert">{link.error}</p> : null}
      </div>
    </section>
  );
}
