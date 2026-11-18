import { Award, Clock, Crown, Package, Truck } from "lucide-react";
import { useEffect } from "react";
import { tariffs } from "../../config/content";
import type { ClientMe } from "../../shared/api/types";
import { CopyButton } from "../../shared/components/CopyButton";
import { ErrorState, Spinner } from "../../shared/components/States";
import { formatMoney, formatNumber, formatWeight } from "../../shared/utils/format";
import { useMe } from "../me/MeContext";

export function HomePage(): JSX.Element {
  const { me, loading, error, reload } = useMe();

  // Stats change while the user works with tracks: refresh on every visit.
  useEffect(() => {
    void reload();
  }, [reload]);

  if (!me) {
    return loading ? (
      <Spinner />
    ) : (
      <ErrorState message={error || "Не удалось загрузить профиль"} onRetry={reload} />
    );
  }

  return (
    <div className="page home-page">
      <section className="hero-card code-card">
        <span className="hero-label">Ваш личный код</span>
        <strong className="code-value">{me.code}</strong>
        <span className="hero-name">{me.name}</span>
        <CopyButton
          text={String(me.code)}
          label="Скопировать код"
          className="on-brand"
        />
      </section>

      <LoyaltyCard me={me} />
      <StatsCard me={me} />
      <TariffsCard />
    </div>
  );
}

function LoyaltyCard({ me }: { me: ClientMe }): JSX.Element {
  const { loyalty, stats } = me;
  const progress = Math.min(Math.max(loyalty.progress_percent, 0), 100);
  const isTop = !loyalty.next_level_label;
  const remaining =
    loyalty.next_level_weight_kg !== null
      ? Math.max(loyalty.next_level_weight_kg - stats.issued_weight_kg, 0)
      : 0;

  return (
    <section className={`card loyalty-card level-${loyalty.level}`}>
      <div className="card-title">
        <span className="card-icon">{isTop ? <Crown size={20} /> : <Award size={20} />}</span>
        <div>
          <span className="muted small">Уровень лояльности</span>
          <h2>{loyalty.label}</h2>
        </div>
      </div>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isTop ? 100 : progress}
      >
        <span style={{ width: `${isTop ? 100 : progress}%` }} />
      </div>

      <p className="muted small">
        {isTop
          ? "У вас максимальный уровень. Спасибо, что вы с нами!"
          : `До уровня «${loyalty.next_level_label}» осталось ${formatWeight(remaining)}` +
            (loyalty.next_level_weight_kg !== null
              ? ` (нужно ${formatWeight(loyalty.next_level_weight_kg)}, у вас ${formatWeight(stats.issued_weight_kg)})`
              : "")}
      </p>
    </section>
  );
}

function StatsCard({ me }: { me: ClientMe }): JSX.Element {
  const { stats } = me;
  const tiles = [
    { label: "Всего треков", value: formatNumber(stats.tracks_total) },
    { label: "В пути / на складе", value: formatNumber(stats.tracks_active) },
    { label: "Выдано треков", value: formatNumber(stats.tracks_issued) },
    { label: "Получено веса", value: formatWeight(stats.issued_weight_kg) },
    { label: "Выдач", value: formatNumber(stats.issuances_count) },
  ];

  return (
    <section className="card">
      <div className="card-title">
        <span className="card-icon">
          <Package size={20} />
        </span>
        <h2>Статистика</h2>
      </div>
      <div className="stats-grid">
        {tiles.map((tile) => (
          <div className="stat-tile" key={tile.label}>
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TariffsCard(): JSX.Element {
  return (
    <section className="card tariffs-card">
      <div className="card-title">
        <span className="card-icon">
          <Truck size={20} />
        </span>
        <h2>Тарифы</h2>
      </div>

      <div className="tariff-delivery">
        <Clock size={18} />
        <span>
          Срок доставки: <strong>{tariffs.deliveryTime}</strong>
        </span>
      </div>

      <div className="tariff-group">
      <h3 className="subheading">Цена за кг (по весу выдачи)</h3>
      <ul className="price-list">
        {tariffs.tiers.map((tier) => (
          <li key={tier.label}>
            <span>{tier.label}</span>
            <strong>{formatMoney(tier.pricePerKg, tariffs.currency)}/кг</strong>
          </li>
        ))}
      </ul>

      {tariffs.cashDiscountPerKg > 0 ? (
        <p className="tariff-discount">
          При оплате наличными — скидка{" "}
          <strong>{formatMoney(tariffs.cashDiscountPerKg, tariffs.currency)}</strong>{" "}
          с каждого кг
        </p>
      ) : null}
      </div>

      <div className="tariff-group">
      <h3 className="subheading">Упаковка</h3>
      <ul className="price-list">
        {tariffs.packages.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <strong>{formatMoney(item.price, tariffs.currency)}</strong>
          </li>
        ))}
      </ul>

      {tariffs.notes.map((note) => (
        <p className="muted small" key={note}>
          {note}
        </p>
      ))}
      </div>
    </section>
  );
}
