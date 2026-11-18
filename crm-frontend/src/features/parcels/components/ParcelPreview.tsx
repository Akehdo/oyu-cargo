import { formatDate } from "../../../shared/utils/date";
import type { RecordEntity } from "../../records/types";
import { Parcel } from "../types";
import { StatusBadge } from "./StatusBadge";

type ParcelPreviewProps = {
  parcel: Parcel;
  record: RecordEntity | null;
  recordMissing: boolean;
  onRecordOpen: (record: RecordEntity) => void;
};

export function ParcelPreview({
  parcel,
  record,
  recordMissing,
  onRecordOpen,
}: ParcelPreviewProps): JSX.Element {
  return (
    <div className="parcel-preview">
      <span className="parcel-preview-track">{parcel.track_number}</span>
      <div className="parcel-preview-meta">
        <StatusBadge status={parcel.status} />
        {(parcel.status === "issued" || record) && (
          <span className="parcel-issued-date">
            Дата выдачи: {formatDate(record?.created_at ?? parcel.updated_at)}
          </span>
        )}
      </div>
      {record && (
        <div className="parcel-record-reference">
          <span>ID выдачи</span>
          <button
            className="entity-id-link"
            type="button"
            title={`Открыть выдачу ${record.id}`}
            onClick={() => onRecordOpen(record)}
          >
            {record.id}
          </button>
        </div>
      )}
      {recordMissing && (
        <div className="parcel-record-reference parcel-record-missing">
          Выдача ещё не создана
        </div>
      )}
    </div>
  );
}
