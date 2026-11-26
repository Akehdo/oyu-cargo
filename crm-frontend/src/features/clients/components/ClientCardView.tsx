import {
  Archive,
  KeyRound,
  Loader2,
  PackageSearch,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { MetricCard } from "../../../shared/components/MetricCard";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { formatDate } from "../../../shared/utils/date";
import { StatusBadge } from "../../parcels/components/StatusBadge";
import type { ClientCard, ClientTrack, ClientTrackStatus } from "../types";
import { ClientPhoneLink } from "./ClientPhoneLink";

type ClientCardViewProps = {
  card: ClientCard;
  resettingPassword: boolean;
  temporaryPassword: string;
  onResetPassword: () => void;
};

const kg = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function ClientCardView({
  card,
  resettingPassword,
  temporaryPassword,
  onResetPassword,
}: ClientCardViewProps): JSX.Element {
  const [showArchive, setShowArchive] = useState(false);
  const { client, stats, loyalty } = card;

  return (
    <section className="client-card" aria-label={`Клиент ${card.code}`}>
      <div className="panel client-hero">
        <div className="client-hero-code">
          <span>Личный код</span>
          <strong>{card.code}</strong>
        </div>
        <div className="client-hero-info">
          {client ? (
            <>
              <h2>{client.name}</h2>
              <dl>
                <div>
                  <dt>Номер регистрации</dt>
                  <dd><ClientPhoneLink phone={client.phone} /></dd>
                </div>
                <div>
                  <dt>Зарегистрирован</dt>
                  <dd>{formatDate(client.created_at)}</dd>
                </div>
                <div>
                  <dt>Уровень</dt>
                  <dd>{loyalty.label}</dd>
                </div>
                <div>
                  <dt>Код</dt>
                  <dd>
                    {client.code_source === "existing"
                      ? "Указан клиентом при регистрации — сверьте с выдачами"
                      : "Выдан приложением"}
                  </dd>
                </div>
                <div>
                  <dt>Telegram</dt>
                  <dd>{client.telegram_linked ? "Подключён" : "Не подключён"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <h2>Не зарегистрирован в приложении</h2>
              <p className="report-note">
                Код встречается только в выдачах CRM. Треки клиента и уведомления
                появятся после регистрации в приложении.
              </p>
            </>
          )}
        </div>
        {client && (
          <div className="client-hero-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={resettingPassword}
              onClick={onResetPassword}
            >
              {resettingPassword ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <KeyRound size={16} />
              )}
              Сбросить пароль
            </button>
            {temporaryPassword && (
              <div className="client-temp-password">
                Новый пароль: <code>{temporaryPassword}</code>
                <small>Передайте клиенту, он больше не будет показан.</small>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="stats-grid client-stats-grid">
        <MetricCard
          label="Выдано, кг"
          value={kg.format(stats.issued_weight_kg)}
        />
        <MetricCard label="Выдач" value={stats.issuances_count} />
        <MetricCard label="Текущие посылки" value={stats.tracks_active} />
        <MetricCard label="Сумма выдач, ₸" value={money.format(stats.total_spent)} />
      </div>

      <div className="panel list-panel">
        <PanelHeader
          icon={<PackageSearch size={18} />}
          title="Текущие посылки"
          meta={`${card.active_tracks.length}`}
        />
        <TrackTable
          tracks={card.active_tracks}
          empty={
            client
              ? "Клиент пока не добавил активных трек-номеров."
              : "Нет данных: клиент не зарегистрирован."
          }
        />
      </div>

      {client && (
        <div className="panel list-panel">
          <div className="list-head">
            <PanelHeader
              icon={<Archive size={18} />}
              title="Корзина — выданные треки"
              meta={`${card.archived_tracks.length}`}
            />
            <button
              className="ghost-button"
              type="button"
              onClick={() => setShowArchive((value) => !value)}
            >
              {showArchive ? "Скрыть" : "Показать"}
            </button>
          </div>
          {showArchive && (
            <TrackTable tracks={card.archived_tracks} empty="Корзина пуста." />
          )}
        </div>
      )}

      <div className="panel list-panel">
        <PanelHeader
          icon={<ReceiptText size={18} />}
          title="Выдачи"
          meta={`${card.issuances.length}`}
        />
        {card.issuances.length === 0 ? (
          <div className="table-state">Выдач по этому коду ещё нет.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Вес, кг</th>
                  <th>Сумма, ₸</th>
                  <th>Трек-номера</th>
                </tr>
              </thead>
              <tbody>
                {card.issuances.map((issuance) => (
                  <tr key={issuance.id}>
                    <td>{formatDate(issuance.created_at)}</td>
                    <td>{kg.format(issuance.weight)}</td>
                    <td>{money.format(issuance.price)}</td>
                    <td className="track-cell client-issuance-tracks">
                      {issuance.track_numbers.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function TrackTable({
  tracks,
  empty,
}: {
  tracks: ClientTrack[];
  empty: string;
}): JSX.Element {
  if (tracks.length === 0) {
    return <div className="table-state">{empty}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Трек-номер</th>
            <th>Товар</th>
            <th>Статус</th>
            <th>Обновлён</th>
            <th>Добавлен</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.id}>
              <td className="track-cell">{track.track_number}</td>
              <td>{track.comment || "—"}</td>
              <td>
                <ClientStatusBadge status={track.status} />
              </td>
              <td>
                {track.status_updated_at
                  ? formatDate(track.status_updated_at)
                  : "—"}
              </td>
              <td>{formatDate(track.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientStatusBadge({
  status,
}: {
  status: ClientTrackStatus;
}): JSX.Element {
  if (status === "pending") {
    return (
      <span className="status-badge status-pending">
        <UserRound size={13} />
        Ожидается на складе
      </span>
    );
  }
  return <StatusBadge status={status} />;
}
