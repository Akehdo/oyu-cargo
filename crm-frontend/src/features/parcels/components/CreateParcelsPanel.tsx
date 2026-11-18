import { Loader2, PackageCheck, Plus } from "lucide-react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { SavingState } from "../hooks/useParcelsDashboard";
import { TrackTextarea } from "./TrackTextarea";

type CreateParcelsPanelProps = {
  draft: string;
  saving: SavingState;
  onDraftChange: (value: string) => void;
  onSubmit: () => Promise<void>;
};

export function CreateParcelsPanel({
  draft,
  saving,
  onDraftChange,
  onSubmit,
}: CreateParcelsPanelProps): JSX.Element {
  return (
    <div className="panel tools-panel">
      <PanelHeader icon={<Plus size={18} />} title="Добавить" />
      <TrackTextarea value={draft} onChange={onDraftChange} />
      <button
        className="primary-button"
        disabled={saving === "create"}
        type="button"
        onClick={onSubmit}
      >
        {saving === "create" ? (
          <Loader2 className="spin" size={18} />
        ) : (
          <PackageCheck size={18} />
        )}
        Сохранить
      </button>
    </div>
  );
}
