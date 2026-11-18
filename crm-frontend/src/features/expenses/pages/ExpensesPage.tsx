import { CreateExpensePanel } from "../components/CreateExpensePanel";
import { ExpenseMessages } from "../components/ExpenseMessages";
import { ExpenseTablePanel } from "../components/ExpenseTablePanel";
import { UpdateExpensePanel } from "../components/UpdateExpensePanel";
import { useExpensesDashboard } from "../hooks/useExpensesDashboard";

export function ExpensesPage(): JSX.Element {
  const expenses = useExpensesDashboard();

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Расходы</div>
          <h1>Расходы</h1>
        </div>
      </header>

      <section className="two-column-grid">
        <CreateExpensePanel
          draft={expenses.createDraft}
          saving={expenses.saving === "create"}
          onDraftChange={expenses.changeCreateDraft}
          onSubmit={expenses.createExpense}
        />
        <UpdateExpensePanel
          draft={expenses.updateDraft}
          saving={expenses.saving === "update"}
          onDraftChange={expenses.changeUpdateDraft}
          onSubmit={expenses.updateExpense}
        />
      </section>

      <ExpenseMessages error={expenses.error} notice={expenses.notice} />

      <ExpenseTablePanel
        expenses={expenses.expenses}
        loading={expenses.loading}
        meta={expenses.meta}
        page={expenses.page}
        saving={expenses.saving}
        setPage={expenses.setPage}
        onDelete={expenses.deleteExpense}
        onUpdateSelect={expenses.selectExpenseForUpdate}
      />
    </main>
  );
}
