import {
  ArrowLeft,
  ArrowRight,
  FilePenLine,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { formatDate } from "../../../shared/utils/date";
import type { ExpenseSavingState } from "../hooks/useExpensesDashboard";
import { ExpenseEntity, ListMeta, paymentTypeLabels } from "../types";

type ExpenseTableProps = {
  expenses: ExpenseEntity[];
  loading: boolean;
  meta: ListMeta;
  page: number;
  saving: ExpenseSavingState;
  setPage: Dispatch<SetStateAction<number>>;
  onDelete: (id: string) => Promise<void>;
  onUpdateSelect: (expense: ExpenseEntity) => void;
};

export function ExpenseTable({
  expenses,
  loading,
  meta,
  page,
  saving,
  setPage,
  onDelete,
  onUpdateSelect,
}: ExpenseTableProps): JSX.Element {
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);

  return (
    <>
      {renderTableState(
        loading,
        expenses,
        saving,
        openExpenseId,
        setOpenExpenseId,
        onDelete,
        onUpdateSelect,
      )}
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
  expenses: ExpenseEntity[],
  saving: ExpenseSavingState,
  openExpenseId: string | null,
  setOpenExpenseId: Dispatch<SetStateAction<string | null>>,
  onDelete: (id: string) => Promise<void>,
  onUpdateSelect: (expense: ExpenseEntity) => void,
): JSX.Element {
  if (loading) {
    return (
      <div className="table-state">
        <Loader2 className="spin" size={22} />
        Загружаем
      </div>
    );
  }

  if (expenses.length === 0) {
    return <div className="table-state">Нет расходов</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Тип оплаты</th>
            <th>Сумма</th>
            <th>Комментарий</th>
            <th>Создано</th>
            <th>Обновлено</th>
            <th className="actions-cell" />
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td>{expense.id}</td>
              <td>{paymentTypeLabels[expense.payment_type]}</td>
              <td>{formatMoney(expense.amount)}</td>
              <td>{expense.comment || "-"}</td>
              <td>{formatDate(expense.created_at)}</td>
              <td>{formatDate(expense.updated_at)}</td>
              <td className="actions-cell">
                <div className="row-actions">
                  <button
                    className="icon-button"
                    type="button"
                    title="Действия"
                    onClick={() =>
                      setOpenExpenseId((current) =>
                        current === expense.id ? null : expense.id,
                      )
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {openExpenseId === expense.id && (
                    <div className="row-actions-menu">
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateSelect(expense);
                          setOpenExpenseId(null);
                        }}
                      >
                        <FilePenLine size={16} />
                        Обновить
                      </button>
                      <button
                        className="danger-action"
                        disabled={saving === "delete"}
                        type="button"
                        onClick={() => {
                          setOpenExpenseId(null);
                          const confirmed = window.confirm(
                            `Удалить расход ${expense.amount.toLocaleString("ru-RU")} ₸ «${expense.comment}»? Отменить удаление нельзя.`,
                          );
                          if (confirmed) {
                            void onDelete(expense.id);
                          }
                        }}
                      >
                        {saving === "delete" ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
