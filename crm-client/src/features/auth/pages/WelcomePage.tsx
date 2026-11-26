import { ArrowRight, PartyPopper } from "lucide-react";
import { brand, hasConfirmedWarehouse } from "../../../config/content";
import { CopyButton } from "../../../shared/components/CopyButton";
import { Logo } from "../../../shared/components/Logo";
import { ErrorState, Spinner } from "../../../shared/components/States";
import { isMiniApp } from "../../../shared/telegram/miniApp";
import { useMe } from "../../me/MeContext";

/** Shown once right after registration: the new personal code, big and copyable. */
export function WelcomePage({ onContinue }: { onContinue: () => void }): JSX.Element {
  const { me, loading, error, reload } = useMe();
  const keptCode = me?.code_source === "existing";

  return (
    <div className="welcome-screen">
      <Logo size="lg" />

      {loading && !me ? <Spinner label="Готовим ваш личный код…" /> : null}
      {error && !me ? <ErrorState message={error} onRetry={reload} /> : null}

      {me ? (
        <>
          <div className="welcome-title">
            <PartyPopper size={28} />
            <h1>Добро пожаловать, {me.name}!</h1>
          </div>
          <div className="hero-card code-card welcome-code">
            <span className="hero-label">{keptCode ? "Ваш личный код сохранён" : "Ваш личный код"}</span>
            <strong className="code-value">{me.code}</strong>
            <CopyButton
              text={String(me.code)}
              label="Скопировать код"
              className="on-brand"
            />
          </div>
          <ul className="welcome-list">
            {keptCode ? (
              <li>Посылки, которые вы уже получали по этому коду, — в истории на вкладке «Посылки».</li>
            ) : null}
            <li>Указывайте этот код в адресе склада при каждом заказе.</li>
            <li>По этому коду вы получаете посылки в пункте выдачи ({brand.city}).</li>
            <li>{hasConfirmedWarehouse()
              ? "Код уже подставлен во вкладке «Адрес» — просто скопируйте."
              : "Во вкладке «Адрес» можно уточнить реквизиты склада у поддержки."}</li>
            {me.telegram?.enabled && !isMiniApp() ? (
              <li>Подключите Telegram в профиле — бот будет сообщать о статусе посылок.</li>
            ) : null}
          </ul>
        </>
      ) : null}

      <button type="button" className="primary-button" onClick={onContinue}>
        Перейти в кабинет
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
