import { Loader2, Search } from "lucide-react";
import { FormEvent } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";
import type { TrackOwner } from "../../clients/types";
import type { RecordEntity } from "../../records/types";
import { SavingState } from "../hooks/useParcelsDashboard";
import { Parcel } from "../types";
import { ParcelPreview } from "./ParcelPreview";
import { TrackOwnerCard } from "./TrackOwnerCard";

type ParcelSearchPanelProps = {
  selectedParcel: Parcel | null;
  selectedRecord: RecordEntity | null;
  recordMissing: boolean;
  saving: SavingState;
  track: string;
  trackOwner: TrackOwner | null;
  onClientOpen: (code: number) => void;
  onRecordOpen: (record: RecordEntity) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onTrackChange: (value: string) => void;
};

export function ParcelSearchPanel({
  selectedParcel,
  selectedRecord,
  recordMissing,
  saving,
  track,
  trackOwner,
  onClientOpen,
  onRecordOpen,
  onSubmit,
  onTrackChange,
}: ParcelSearchPanelProps): JSX.Element {
  return (
    <div className="panel search-panel" id="parcel-search-panel">
      <PanelHeader icon={<Search size={18} />} title="Поиск" />
      <form onSubmit={onSubmit} className="search-form">
        <input
          value={track}
          onChange={(event) =>
            onTrackChange(fixTrackKeyboardLayout(event.target.value))
          }
          placeholder="Трек-номер"
        />
        <button
          className="icon-button"
          disabled={saving === "search"}
          type="submit"
          title="Найти"
        >
          {saving === "search" ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <Search size={18} />
          )}
        </button>
      </form>
      {selectedParcel && (
        <ParcelPreview
          parcel={selectedParcel}
          record={selectedRecord}
          recordMissing={recordMissing}
          onRecordOpen={onRecordOpen}
        />
      )}
      {trackOwner && (
        <TrackOwnerCard owner={trackOwner} onClientOpen={onClientOpen} />
      )}
    </div>
  );
}
