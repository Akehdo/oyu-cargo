import { Check, Loader2, PackageCheck } from "lucide-react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { SavingState } from "../hooks/useParcelsDashboard";
import { ParcelStatus, parcelStatuses } from "../types";
import { TrackTextarea } from "./TrackTextarea";

type UpdateStatusPanelProps = {
  draft: string;
  saving: SavingState;
  status: ParcelStatus;
  onDraftChange: (value: string) => void;
  onStatusChange: (status: ParcelStatus) => void;
  onSubmit: () => Promise<void>;
};

export function UpdateStatusPanel({
  draft,
  saving,
  status,
  onDraftChange,
  onStatusChange,
  onSubmit,
}: UpdateStatusPanelProps): JSX.Element {
  return (
    <div className="panel tools-panel">
      <PanelHeader icon={<PackageCheck size={18} />} title="Обновить статус" />
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as ParcelStatus)}
      >
        {parcelStatuses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <TrackTextarea value={draft} onChange={onDraftChange} />
      <button
        className="secondary-button"
        disabled={saving === "status"}
        type="button"
        onClick={onSubmit}
      >
        {saving === "status" ? (
          <Loader2 className="spin" size={18} />
        ) : (
          <Check size={18} />
        )}
        Применить
      </button>
    </div>
  );
}
