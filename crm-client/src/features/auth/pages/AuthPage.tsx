import {
  Bell,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  MapPin,
  Truck,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { brand, hasConfirmedWarehouse, tariffs } from "../../../config/content";
import { Logo } from "../../../shared/components/Logo";
import { ApiError, errorText } from "../../../shared/api/http";
import { formatLoginInput, isPhoneInput, maskPhoneInput } from "../../../shared/utils/format";
import { TermsModal } from "../components/TermsModal";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../../../shared/router";

export type AuthTab = "login" | "register";

const MIN_PASSWORD_LENGTH = 6;

export function AuthPage({
  mode,
  sessionMessage,
}: {
  mode: AuthTab;
  sessionMessage: string;
}): JSX.Element {
  const { navigate, search } = useRouter();
  const tab = mode;
  // Keep ?next= when switching tabs so the user lands where they were going.
  const setTab = (next: AuthTab) => {
    const query = search.get("next") ? `?next=${encodeURIComponent(search.get("next") ?? "")}` : "";
    navigate(`/${next}${query}`, { replace: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <Logo size="lg" />
        <p>{brand.tagline}</p>
        <span className="auth-hero-city">Пункт выдачи — {brand.city}</span>
        <ul className="auth-hero-points">
          <li>
            <KeyRound size={18} />
            Личный код сразу после регистрации
          </li>
          <li>
            <MapPin size={18} />
            {hasConfirmedWarehouse() ? "Адрес склада в Китае уже с вашим кодом" : "Поддержка при оформлении заказа"}
          </li>
          <li>
            <Bell size={18} />
            Статусы посылок и уведомления о прибытии
          </li>
          <li>
            <Truck size={18} />
            Доставка {tariffs.deliveryTime}
          </li>
        </ul>
      </div>

      <div className="card auth-card">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={tab === "login" ? "active" : ""}
            onClick={() => setTab("login")}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={tab === "register" ? "active" : ""}
            onClick={() => setTab("register")}
          >
            Регистрация
          </button>
        </div>

        {sessionMessage && tab === "login" ? (
          <p className="notice">{sessionMessage}</p>
        ) : null}

        {tab === "login" ? (
          <LoginForm onSwitch={() => setTab("register")} />
        ) : (
          <RegisterForm onSwitch={() => setTab("login")} />
        )}
      </div>
    </div>
  );
}

function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label>
      Телефон
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 (700) 000-00-00"
        value={value}
        onFocus={() => {
          if (!value) onChange("+7 ");
        }}
        onBlur={() => {
          if (value.trim() === "+7") onChange("");
        }}
        onChange={(event) => onChange(maskPhoneInput(event.target.value, value))}
        required
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}): JSX.Element {
  const [visible, setVisible] = useState(false);

  return (
    <label>
      {label}
      <span className="input-with-action">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          className="input-action"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

/** Phone for clients (masked as +7 ...), email for administrators. */
function LoginField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label>
      Телефон или email
      <input
        type="text"
        inputMode={!value ? "text" : isPhoneInput(value) ? "tel" : "email"}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="+7 (700) 000-00-00"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(formatLoginInput(next, value));
        }}
        onBlur={() => onChange(formatLoginInput(value, value, true))}
        required
      />
    </label>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }): JSX.Element {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      // App redirects once the session is set (see postLoginPath).
      await login({ login: phone.trim(), password });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? "Неверный логин или пароль."
          : errorText(caught, "Не удалось войти"),
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <LoginField value={phone} onChange={setPhone} />
      <PasswordField
        label="Пароль"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {error ? <p className="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={18} /> : null}
        Войти
      </button>
      <p className="form-footnote">
        Ещё нет кода?{" "}
        <button type="button" className="link-button" onClick={onSwitch}>
          Зарегистрироваться
        </button>
      </p>
      <p className="form-footnote muted">
        Забыли пароль? Напишите нам в WhatsApp — мы сбросим его.
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }): JSX.Element {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Укажите имя.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
      return;
    }
    if (password !== passwordRepeat) {
      setError("Пароли не совпадают.");
      return;
    }
    if (!accepted) {
      setError("Нужно согласиться с условиями карго.");
      return;
    }

    setBusy(true);
    try {
      await register({ name: name.trim(), phone: phone.trim(), password });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "TERMS_VERSION_MISMATCH") {
        setAccepted(false);
        setError("Условия изменились. Обновите страницу, прочитайте новую редакцию и подтвердите согласие.");
        setBusy(false);
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 409
          ? "Этот номер уже зарегистрирован. Войдите или напишите нам, если не помните пароль."
          : errorText(caught, "Не удалось зарегистрироваться"),
      );
      setBusy(false);
    }
  };

  const passwordsMismatch =
    passwordRepeat.length > 0 && password !== passwordRepeat;

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Имя
        <input
          autoComplete="given-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <PhoneField value={phone} onChange={setPhone} />
      <PasswordField
        label={`Пароль (не менее ${MIN_PASSWORD_LENGTH} символов)`}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />
      <PasswordField
        label="Повтор пароля"
        value={passwordRepeat}
        onChange={setPasswordRepeat}
        autoComplete="new-password"
      />
      {passwordsMismatch ? (
        <p className="field-hint danger">Пароли не совпадают</p>
      ) : null}

      <div className="checkbox-row">
        <input
          id="accept-terms"
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <label htmlFor="accept-terms">
          <span>
            Я согласен с{" "}
            <button
              type="button"
              className="link-button"
              onClick={(event) => {
                event.preventDefault();
                setTermsOpen(true);
              }}
            >
              условиями карго
            </button>
          </span>
        </label>
      </div>

      {error ? <p className="alert">{error}</p> : null}
      <button
        className="primary-button"
        type="submit"
        disabled={busy || !accepted}
      >
        {busy ? <LoaderCircle className="spin" size={18} /> : null}
        Получить личный код
      </button>
      <p className="form-footnote">
        Уже есть код?{" "}
        <button type="button" className="link-button" onClick={onSwitch}>
          Войти
        </button>
      </p>

      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAccept={() => setAccepted(true)}
      />
    </form>
  );
}
