import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { formatDate } from "../../../shared/utils/date";
import { ListMeta, Parcel } from "../types";
import { StatusBadge } from "./StatusBadge";

type ParcelTableProps = {
  loading: boolean;
  meta: ListMeta;
  page: number;
  parcels: Parcel[];
  setPage: Dispatch<SetStateAction<number>>;
  onParcelOpen: (parcel: Parcel) => Promise<void>;
};

export function ParcelTable({
  loading,
  meta,
  page,
  parcels,
  setPage,
  onParcelOpen,
}: ParcelTableProps): JSX.Element {
  return (
    <>
      {renderTableState(loading, parcels, onParcelOpen)}
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
  parcels: Parcel[],
  onParcelOpen: (parcel: Parcel) => Promise<void>,
): JSX.Element {
  if (loading) {
    return (
      <div className="table-state">
        <Loader2 className="spin" size={22} />
        Загружаем
      </div>
    );
  }

  if (parcels.length === 0) {
    return <div className="table-state">Нет отправлений</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Трек-номер</th>
            <th>Статус</th>
            <th>Создано</th>
            <th>Обновлено</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel) => (
            <tr key={parcel.id}>
              <td>
                <button
                  className="entity-id-link table-id-link"
                  type="button"
                  title={`Открыть связанную выдачу ${parcel.id}`}
                  onClick={() => void onParcelOpen(parcel)}
                >
                  {parcel.id}
                </button>
              </td>
              <td className="track-cell">{parcel.track_number}</td>
              <td>
                <StatusBadge status={parcel.status} />
              </td>
              <td>{formatDate(parcel.created_at)}</td>
              <td>{formatDate(parcel.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
