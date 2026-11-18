import { List } from "lucide-react";
import { useEffect } from "react";
import { CreateRecordPanel } from "../components/CreateRecordPanel";
import { DailyTrackNumbersDialog } from "../components/DailyTrackNumbersDialog";
import { RecordMessages } from "../components/RecordMessages";
import { RecordTablePanel } from "../components/RecordTablePanel";
import { UpdateRecordPanel } from "../components/UpdateRecordPanel";
import { useRecordsDashboard } from "../hooks/useRecordsDashboard";
import type { RecordEntity } from "../types";

type RecordsPageProps = {
  recordToOpen: RecordEntity | null;
  onRecordOpened: () => void;
};

export function RecordsPage({
  recordToOpen,
  onRecordOpened,
}: RecordsPageProps): JSX.Element {
  const records = useRecordsDashboard();

  useEffect(() => {
    if (!recordToOpen) {
      return;
    }

    records.selectRecordForUpdate(recordToOpen);
    onRecordOpened();
  }, [recordToOpen]);

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Создание и обновление записей</div>
          <h1>Записи</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void records.openDailyTracks()}
          >
            <List size={18} />
            Треки за день
          </button>
        </div>
      </header>

      <DailyTrackNumbersDialog
        date={records.dailyTrackDate}
        error={records.dailyTracksError}
        loading={records.dailyTracksLoading}
        open={records.dailyTracksOpen}
        trackNumbers={records.dailyTrackNumbers}
        onClose={() => records.setDailyTracksOpen(false)}
        onDateChange={records.changeDailyTrackDate}
        onLoad={records.loadDailyTrackNumbers}
      />

      <section className="two-column-grid">
        <CreateRecordPanel
          draft={records.createDraft}
          saving={records.saving === "create"}
          onDraftChange={records.changeCreateDraft}
          onSubmit={records.createRecord}
        />
        <UpdateRecordPanel
          draft={records.updateDraft}
          saving={records.saving === "update"}
          onDraftChange={records.changeUpdateDraft}
          onReload={records.reloadRecord}
          onSubmit={records.updateRecord}
        />
      </section>

      <RecordMessages error={records.error} notice={records.notice} />

      <RecordTablePanel
        filter={records.filter}
        loading={records.loading}
        meta={records.meta}
        page={records.page}
        records={records.records}
        saving={records.saving}
        setFilter={records.setFilter}
        setPage={records.setPage}
        onDelete={records.deleteRecord}
        onUpdateSelect={records.selectRecordForUpdate}
      />
    </main>
  );
}
