import type { Dispatch, SetStateAction } from "react";
import type { ExpenseSavingState } from "../hooks/useExpensesDashboard";
import type { ExpenseEntity, ListMeta } from "../types";
import { ExpenseTable } from "./ExpenseTable";

type ExpenseTablePanelProps = {
  expenses: ExpenseEntity[];
  loading: boolean;
  meta: ListMeta;
  page: number;
  saving: ExpenseSavingState;
  setPage: Dispatch<SetStateAction<number>>;
  onDelete: (id: string) => Promise<void>;
  onUpdateSelect: (expense: ExpenseEntity) => void;
};

export function ExpenseTablePanel(props: ExpenseTablePanelProps): JSX.Element {
  return (
    <section className="panel list-panel">
      <div className="list-head">
        <div className="panel-title">
          <h2>Список расходов</h2>
          <span>{props.meta.total}</span>
        </div>
      </div>
      <ExpenseTable
        expenses={props.expenses}
        loading={props.loading}
        meta={props.meta}
        page={props.page}
        saving={props.saving}
        setPage={props.setPage}
        onDelete={props.onDelete}
        onUpdateSelect={props.onUpdateSelect}
      />
    </section>
  );
}
