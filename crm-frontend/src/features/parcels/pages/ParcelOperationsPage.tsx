import { CreateParcelsPanel } from "../components/CreateParcelsPanel";
import { ParcelMessages } from "../components/ParcelMessages";
import { ParcelMetrics } from "../components/ParcelMetrics";
import { UpdateStatusPanel } from "../components/UpdateStatusPanel";
import { useParcelsDashboard } from "../hooks/useParcelsDashboard";

export function ParcelOperationsPage(): JSX.Element {
  const parcels = useParcelsDashboard();

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Массовые действия</div>
          <h1>Операции</h1>
        </div>
      </header>

      <section className="two-column-grid">
        <CreateParcelsPanel
          draft={parcels.createDraft}
          saving={parcels.saving}
          onDraftChange={parcels.setCreateDraft}
          onSubmit={parcels.createParcels}
        />
        <UpdateStatusPanel
          draft={parcels.statusDraft}
          saving={parcels.saving}
          status={parcels.statusTarget}
          onDraftChange={parcels.setStatusDraft}
          onStatusChange={parcels.setStatusTarget}
          onSubmit={parcels.updateStatuses}
        />
      </section>

      <ParcelMessages error={parcels.error} notice={parcels.notice} />
    </main>
  );
}
