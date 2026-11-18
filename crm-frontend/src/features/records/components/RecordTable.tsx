import {
  ArrowLeft,
  ArrowRight,
  FilePenLine,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../../../shared/utils/date";
import type { RecordSavingState } from "../hooks/useRecordsDashboard";
import {
  ListMeta,
  packageTypeLabels,
  paymentTypeLabels,
  RecordEntity,
} from "../types";

type RecordTableProps = {
  loading: boolean;
  meta: ListMeta;
  page: number;
  records: RecordEntity[];
  saving: RecordSavingState;
  setPage: Dispatch<SetStateAction<number>>;
  onDelete: (id: string) => Promise<void>;
  onUpdateSelect: (record: RecordEntity) => void;
};

export function RecordTable({
  loading,
  meta,
  page,
  records,
  saving,
  setPage,
  onDelete,
  onUpdateSelect,
}: RecordTableProps): JSX.Element {
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);

  return (
    <>
      {renderTableState(
        loading,
        records,
        saving,
        openRecordId,
        setOpenRecordId,
        onDelete,
        onUpdateSelect,
      )}
      <div className="pagination">
        <button
          className="icon-button"
          disabled={page <= 1}
          type="button"
          title="Назад"
          onClick={() => setPage(Math.max(1, page - 1))}
        >
          <ArrowLeft size={18} />
        </button>
        <span>
          {meta.page} / {Math.max(meta.total_pages, 1)}
        </span>
        <button
          className="icon-button"
          disabled={meta.total_pages === 0 || page >= meta.total_pages}
          type="button"
          title="Вперед"
          onClick={() => setPage(page + 1)}
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </>
  );
}

function renderTableState(
  loading: boolean,
  records: RecordEntity[],
  saving: RecordSavingState,
  openRecordId: string | null,
  setOpenRecordId: Dispatch<SetStateAction<string | null>>,
  onDelete: (id: string) => Promise<void>,
  onUpdateSelect: (record: RecordEntity) => void,
): JSX.Element {
  if (loading) {
    return (
      <div className="table-state">
        <Loader2 className="spin" size={22} />
        Загружаем
      </div>
    );
  }

  if (records.length === 0) {
    return <div className="table-state">Нет записей</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Клиент</th>
            <th>Оплата</th>
            <th>Вес</th>
            <th>Пакет</th>
            <th>Цена</th>
            <th>Создано</th>
            <th>Обновлено</th>
            <th className="actions-cell" />
            <th>Трек-номера</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>
                <button
                  className="entity-id-link table-id-link"
                  type="button"
                  title={`Открыть выдачу ${record.id}`}
                  onClick={() => onUpdateSelect(record)}
                >
                  {record.id}
                </button>
              </td>
              <td>{record.client_code}</td>
              <td>
                <span className="status-badge">
                  {formatRecordPayments(record)}
                </span>
              </td>
              <td>{record.weight}</td>
              <td>{packageTypeLabels[record.package_type]}</td>
              <td>{record.price}</td>
              <td>{formatDate(record.created_at)}</td>
              <td>{formatDate(record.updated_at)}</td>
              <td className="actions-cell">
                <div className="row-actions">
                  <button
                    className="icon-button"
                    type="button"
                    title="Действия"
                    onClick={() =>
                      setOpenRecordId((current) =>
                        current === record.id ? null : record.id,
                      )
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {openRecordId === record.id && (
                    <div className="row-actions-menu">
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateSelect(record);
                          setOpenRecordId(null);
                        }}
                      >
                        <FilePenLine size={16} />
                        Обновить
                      </button>
                      <button
                        className="danger-action"
                        disabled={saving === "delete"}
                        type="button"
                        onClick={() => {
                          setOpenRecordId(null);
                          const tracks = record.track_numbers;
                          const confirmed = window.confirm(
                            [
                              `Удалить выдачу клиента ${record.client_code}?`,
                              `Сумма: ${record.price.toLocaleString("ru-RU")} ₸, вес: ${record.weight.toLocaleString("ru-RU")} кг.`,
                              `Треки (${tracks.length}): ${tracks.slice(0, 5).join(", ")}${tracks.length > 5 ? "…" : ""}`,
                              "",
                              "Оплаты будут удалены из кассы, посылкам вернётся статус до выдачи. Отменить удаление нельзя.",
                            ].join("\n"),
                          );
                          if (confirmed) {
                            void onDelete(record.id);
                          }
                        }}
                      >
                        {saving === "delete" ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </td>
              <td
                className="track-cell"
                title={record.track_numbers.join("\n")}
              >
                <span className="record-tracks-summary">
                  <span className="record-tracks-first">
                    {record.track_numbers[0] ?? "—"}
                  </span>
                  {record.track_numbers.length > 1 && (
                    <span className="record-tracks-more">
                      +{record.track_numbers.length - 1} ещё
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRecordPayments(record: RecordEntity): string {
  const payments =
    record.payments && record.payments.length > 0
      ? record.payments
      : [{ amount: record.price, payment_type: record.payment_type }];

  return payments
    .map(
      (payment) =>
        `${paymentTypeLabels[payment.payment_type]} ${formatMoney(payment.amount)}`,
    )
    .join(" + ");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
