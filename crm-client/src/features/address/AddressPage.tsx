import { CircleAlert, Lightbulb, Warehouse } from "lucide-react";
import { hasConfirmedWarehouse, support, warehouse } from "../../config/content";
import { CopyButton } from "../../shared/components/CopyButton";
import { ErrorState, Spinner } from "../../shared/components/States";
import { useMe } from "../me/MeContext";

function fillCode(template: string, code: string): string {
  return template.split("{code}").join(code);
}

export function AddressPage(): JSX.Element {
  const { me, loading, error, reload } = useMe();

  if (!hasConfirmedWarehouse()) {
    return (
      <section className="card">
        <h2>{warehouse.title}</h2>
        <p>Перед оформлением заказа уточните адрес склада в поддержке.</p>
        <a href={support.whatsappUrl} target="_blank" rel="noreferrer">
          Узнать адрес в WhatsApp
        </a>
      </section>
    );
  }

  if (!me) {
    return loading ? (
      <Spinner />
    ) : (
      <ErrorState message={error || "Не удалось загрузить профиль"} onRetry={reload} />
    );
  }

  const code = String(me.code);
  const lines = warehouse.lines.map((line) => ({
    ...line,
    value: fillCode(line.value, code),
  }));
  // Values only, one per line: Taobao/Pinduoduo "smart fill" parses this best.
  const allText = lines.map((line) => line.value).join("\n");

  return (
    <div className="page address-page">
      <section className="card">
        <div className="card-title">
          <span className="card-icon">
            <Warehouse size={20} />
          </span>
          <div>
            <h2>{warehouse.title}</h2>
            <span className="muted small">
              Ваш код <strong className="brand-text">{code}</strong> уже вставлен
            </span>
          </div>
        </div>

        <ul className="address-lines">
          {lines.map((line) => (
            <li key={line.label}>
              <div className="address-line-text">
                <span className="address-label">
                  {line.label}
                  {line.hint ? <em>{line.hint}</em> : null}
                </span>
                <span className="address-value">{line.value}</span>
              </div>
              <CopyButton text={line.value} title={`Скопировать: ${line.label}`} />
            </li>
          ))}
        </ul>

        <CopyButton
          text={allText}
          label="Скопировать всё"
          copiedLabel="Адрес скопирован"
          className="primary-copy"
        />

        <p className="warning-box">
          <CircleAlert size={18} />
          <span>{warehouse.warning}</span>
        </p>
      </section>

      <section className="card">
        <div className="card-title">
          <span className="card-icon">
            <Lightbulb size={20} />
          </span>
          <h2>Как вставить адрес</h2>
        </div>
        <ul className="hint-list">
          {warehouse.pasteHints.map((hint) => (
            <li key={hint.app}>
              <strong>{hint.app}</strong>
              <span>{hint.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
