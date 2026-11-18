import type { Dispatch, SetStateAction } from "react";
import type { RecordSavingState } from "../hooks/useRecordsDashboard";
import { ListMeta, PaymentFilter, RecordEntity } from "../types";
import { RecordFilters } from "./RecordFilters";
import { RecordTable } from "./RecordTable";

type RecordTablePanelProps = {
  filter: PaymentFilter;
  loading: boolean;
  meta: ListMeta;
  page: number;
  records: RecordEntity[];
  saving: RecordSavingState;
  setFilter: Dispatch<SetStateAction<PaymentFilter>>;
  setPage: Dispatch<SetStateAction<number>>;
  onDelete: (id: string) => Promise<void>;
  onUpdateSelect: (record: RecordEntity) => void;
};

export function RecordTablePanel(props: RecordTablePanelProps): JSX.Element {
  return (
    <section className="panel list-panel">
      <div className="list-head">
        <RecordFilters
          filter={props.filter}
          setFilter={props.setFilter}
          setPage={props.setPage}
        />
      </div>
      <RecordTable
        loading={props.loading}
        meta={props.meta}
        page={props.page}
        records={props.records}
        saving={props.saving}
        setPage={props.setPage}
        onDelete={props.onDelete}
        onUpdateSelect={props.onUpdateSelect}
      />
    </section>
  );
}
