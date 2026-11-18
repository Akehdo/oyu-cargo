import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CreditCard,
  Loader2,
  WalletCards,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { MetricCard } from "../../../shared/components/MetricCard";
import { formatDate } from "../../../shared/utils/date";
import { paymentTypeLabels, paymentTypes } from "../../records/types";
import { CashTransferPanel } from "../components/CashTransferPanel";
import { useCashDashboard } from "../hooks/useCashDashboard";
import type {
  CashTransaction,
  ListMeta,
  PaymentFilter,
  TransactionType,
  TransactionTypeFilter,
} from "../types";
import { transactionTypeLabels, transactionTypeOptions } from "../types";

export function CashPage(): JSX.Element {
  const cash = useCashDashboard();
  const { summary } = cash;

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Касса</div>
          <h1>Касса</h1>
        </div>
      </header>

      <section className="stats-grid cash-summary-grid">
        <MetricCard
          label="Общие деньги"
          value={
            <span className={summary && summary.balance < 0 ? "cash-negative" : ""}>
              {formatMoney(summary?.balance)}
            </span>
          }
        />
        <MetricCard
          label="Прибыль за период"
          value={
            <span className={summary && summary.profit < 0 ? "cash-negative" : ""}>
              {formatMoney(summary?.profit)}
            </span>
          }
        />
        <MetricCard
          label="Доход за период"
          value={formatMoney(summary?.income)}
        />
        <MetricCard
          label="Расход за период"
          value={formatMoney(summary?.expense)}
        />
      </section>

      <section className="cash-balances">
        <h2>Остатки по кассам</h2>
        <div className="stats-grid">
          {paymentTypes.map((paymentType) => {
            const balance = summary?.balances[paymentType.value];

            return (
              <MetricCard
                key={paymentType.value}
                label={paymentType.label}
                value={
                  <span className={balance !== undefined && balance < 0 ? "cash-negative" : ""}>
                    {formatMoney(balance)}
                  </span>
                }
              />
            );
          })}
        </div>
      </section>

      <section className="single-column-grid">
        <CashTransferPanel
          disabled={!summary && !cash.transferPending}
          pending={cash.transferPending}
          draft={cash.transferDraft}
          saving={cash.transferring}
          onDraftChange={cash.changeTransferDraft}
          onSubmit={cash.transferMoney}
        />
      </section>

      {(cash.error || cash.notice) && (
        <div className={cash.error ? "alert" : "notice"}>
          {cash.error || cash.notice}
        </div>
      )}

      <section className="panel list-panel">
        <PanelHeader
          icon={<WalletCards size={18} />}
          title="Движение денег"
          meta={summary ? `${cash.meta.total} операций` : undefined}
        />

        <CashFilters
          dateFrom={cash.dateFrom}
          dateTo={cash.dateTo}
          paymentFilter={cash.paymentFilter}
          transactionTypeFilter={cash.transactionTypeFilter}
          onDateFromChange={cash.setDateFrom}
          onDateToChange={cash.setDateTo}
          onPaymentFilterChange={cash.setPaymentFilter}
          onResetCurrentMonth={cash.resetCurrentMonth}
          onTransactionTypeFilterChange={cash.setTransactionTypeFilter}
        />

        {(summary || cash.loading) && (
          <CashTable
            loading={cash.loading}
            meta={cash.meta}
            page={cash.page}
            setPage={cash.setPage}
            transactions={cash.transactions}
          />
        )}
      </section>
    </main>
  );
}

type CashFiltersProps = {
  dateFrom: string;
  dateTo: string;
  paymentFilter: PaymentFilter;
  transactionTypeFilter: TransactionTypeFilter;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPaymentFilterChange: (filter: PaymentFilter) => void;
  onResetCurrentMonth: () => void;
  onTransactionTypeFilterChange: (filter: TransactionTypeFilter) => void;
};

function CashFilters({
  dateFrom,
  dateTo,
  paymentFilter,
  transactionTypeFilter,
  onDateFromChange,
  onDateToChange,
  onPaymentFilterChange,
  onResetCurrentMonth,
  onTransactionTypeFilterChange,
}: CashFiltersProps): JSX.Element {
  return (
    <div className="cash-filters">
      <div className="cash-date-filters">
        <label>
          С
          <input
            type="date"
            max={dateTo || undefined}
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>
        <label>
          По
          <input
            type="date"
            min={dateFrom || undefined}
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={onResetCurrentMonth}
        >
          Текущий месяц
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Фильтр операций">
        <button
          className={transactionTypeFilter === "all" ? "active" : ""}
          type="button"
          onClick={() => onTransactionTypeFilterChange("all")}
        >
          Все
        </button>
        {transactionTypeOptions.map((option) => (
          <button
            className={transactionTypeFilter === option.value ? "active" : ""}
            key={option.value}
            type="button"
            onClick={() => onTransactionTypeFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="tabs" role="tablist" aria-label="Фильтр оплаты">
        <button
          className={paymentFilter === "all" ? "active" : ""}
          type="button"
          onClick={() => onPaymentFilterChange("all")}
        >
          Все
        </button>
        {paymentTypes.map((paymentType) => (
          <button
            className={paymentFilter === paymentType.value ? "active" : ""}
            key={paymentType.value}
            type="button"
            onClick={() => onPaymentFilterChange(paymentType.value)}
          >
            {paymentType.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type CashTableProps = {
  loading: boolean;
  meta: ListMeta;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  transactions: CashTransaction[];
};

function CashTable({
  loading,
  meta,
  page,
  setPage,
  transactions,
}: CashTableProps): JSX.Element {
  if (loading) {
    return (
      <div className="table-state" role="status">
        <Loader2 className="spin" size={22} />
        Загружаем
      </div>
    );
  }
  return (
    <>
      {renderTableState(transactions)}
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

function renderTableState(transactions: CashTransaction[]): JSX.Element {
  if (transactions.length === 0) {
    return <div className="table-state">Нет операций</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Оплата</th>
            <th>Сумма</th>
            <th>Источник</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{formatDate(transaction.created_at)}</td>
              <td>
                <span className="status-badge">
                  {transactionIcon(transaction.transaction_type)}
                  {transactionTypeLabels[transaction.transaction_type]}
                </span>
              </td>
              <td>{paymentTypeLabels[transaction.payment_type]}</td>
              <td className={transactionAmountClass(transaction.transaction_type)}>
                {transaction.transaction_type === "EXPENSE" ? "-" : "+"}
                {formatMoney(transaction.amount)}
              </td>
              <td>{transactionSource(transaction)}</td>
              <td>{transaction.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function transactionIcon(transactionType: TransactionType): JSX.Element {
  return transactionType === "INCOME" ? (
    <Banknote size={14} />
  ) : (
    <CreditCard size={14} />
  );
}

function transactionAmountClass(transactionType: TransactionType): string {
  return transactionType === "EXPENSE" ? "cash-negative" : "cash-positive";
}

function transactionSource(transaction: CashTransaction): string {
  if (transaction.record_id) {
    return `Запись ${transaction.record_id}`;
  }

  if (transaction.expense_id) {
    return `Расход ${transaction.expense_id}`;
  }

  return "Перевод между кассами";
}

function formatMoney(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
