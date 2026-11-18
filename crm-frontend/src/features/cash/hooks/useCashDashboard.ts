import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/context/AuthContext";
import { sessionKey } from "../../auth/lib/tokenStorage";
import { ApiError } from "../../../shared/api/http";
import { clearPendingTransfer, newTransferKey, readPendingTransfer, storePendingTransfer } from "../lib/pendingTransfer";
import { usePersistedState } from "../../../shared/hooks/usePersistedState";
import { businessMonthRange, isCalendarDate } from "../../../shared/utils/businessDate";
import { readableError } from "../../../shared/utils/errors";
import { parseDecimalInput } from "../../../shared/utils/number";
import {
  createCashTransferRequest,
  listTransactionsRequest,
} from "../api/transactionsApi";
import type {
  CashSummary,
  CashTransferDraft,
  CashTransaction,
  ListMeta,
  PaymentFilter,
  TransactionTypeFilter,
} from "../types";
import { initialCashSummary, initialCashTransferDraft } from "../types";

export function useCashDashboard() {
  const { api, tokens } = useAuth();
  const storageKey = `crm.cash.pendingTransfer.${sessionKey(tokens)}`;
  // The period starts as the current business month on every visit; a saved
  // range would keep showing an old month long after it ended.
  const [{ dateFrom, dateTo }, setRange] = useState(businessMonthRange);
  const [paymentFilter, persistPaymentFilter] =
    usePersistedState<PaymentFilter>("crm.cash.paymentFilter", "all");
  const [transactionTypeFilter, persistTransactionTypeFilter] =
    usePersistedState<TransactionTypeFilter>(
      "crm.cash.transactionTypeFilter",
      "all",
    );
  const [page, setPage] = usePersistedState("crm.cash.page", 1);
  const [revision, setRevision] = useState(0);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [meta, setMeta] = useState<ListMeta>({
    limit: 20,
    page: 1,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(() => readPendingTransfer(storageKey));
  const [transferDraft, setTransferDraft] = useState<CashTransferDraft>(() => pending ? {
    amount: String(pending.payload.amount),
    fromPaymentType: pending.payload.from_payment_type,
    toPaymentType: pending.payload.to_payment_type,
  } : initialCashTransferDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSummary(null);
    const rangeError = cashDateError(dateFrom, dateTo);
    setError(rangeError);
    if (rangeError) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    async function loadTransactions() {
      try {
        const payload = await listTransactionsRequest(api, {
          dateFrom,
          dateTo,
          page,
          paymentType: paymentFilter,
          transactionType: transactionTypeFilter,
        });
        if (active) {
          if (!payload.summary) {
            setError("Не удалось получить остатки и итоги кассы.");
            return;
          }
          setTransactions(payload.items ?? []);
          setSummary(normalizeCashSummary(payload.summary));
          setMeta(payload.meta ?? { page, limit: 20, total: 0, total_pages: 0 });
        }
      } catch (err) {
        if (active) setError(readableError(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTransactions();
    return () => {
      active = false;
    };
  }, [api, dateFrom, dateTo, page, paymentFilter, transactionTypeFilter, revision]);

  const setPaymentFilter = (filter: PaymentFilter) => {
    persistPaymentFilter(filter);
    setPage(1);
  };

  const setTransactionTypeFilter = (filter: TransactionTypeFilter) => {
    persistTransactionTypeFilter(filter);
    setPage(1);
  };

  const setDateFrom = (value: string) => {
    setRange((range) => ({ ...range, dateFrom: value }));
    setPage(1);
  };

  const setDateTo = (value: string) => {
    setRange((range) => ({ ...range, dateTo: value }));
    setPage(1);
  };

  const resetCurrentMonth = () => {
    setRange(businessMonthRange());
    setPage(1);
  };

  const changeTransferDraft = (patch: Partial<CashTransferDraft>) => {
    setTransferDraft((current) => ({ ...current, ...patch }));
  };

  const transferMoney = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (inFlight.current || (!summary && !pending)) return;

    const amount = parseDecimalInput(transferDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Укажите сумму перевода больше нуля.");
      return;
    }

    if (transferDraft.fromPaymentType === transferDraft.toPaymentType) {
      setError("Выберите разные кассы для перевода.");
      return;
    }

    const available = summary?.balances[transferDraft.fromPaymentType] ?? 0;
    if (!pending && amount > available) {
      setError(`Недостаточно денег в выбранной кассе. Доступно: ${available}.`);
      return;
    }

    const operation = pending ?? {
      key: newTransferKey(),
      payload: {
        amount,
        from_payment_type: transferDraft.fromPaymentType,
        to_payment_type: transferDraft.toPaymentType,
      },
    };
    if (!storePendingTransfer(storageKey, operation)) {
      setError("Браузер не сохранил реквизиты для безопасного повтора. Перевод не отправлен.");
      return;
    }
    inFlight.current = true;
    setPending(operation);
    setTransferring(true);
    setError("");
    setNotice("");

    try {
      await createCashTransferRequest(api, operation.payload, operation.key);
      clearPendingTransfer(storageKey, operation.key);
      setPending(null);
      setTransferDraft((current) => ({ ...current, amount: "" }));
      setNotice(`Перевод на сумму ${amount} выполнен.`);

      setPage(1);
      setRevision((value) => value + 1);
    } catch (err) {
      if (err instanceof ApiError && [400, 403, 404, 409, 422].includes(err.status ?? 0)) {
        clearPendingTransfer(storageKey, operation.key);
        setPending(null);
        setError(readableError(err));
      } else {
        setError("Результат перевода не подтверждён. Повторите проверку с теми же реквизитами.");
      }
    } finally {
      inFlight.current = false;
      setTransferring(false);
    }
  };

  return {
    changeTransferDraft,
    dateFrom,
    dateTo,
    error,
    loading,
    meta,
    notice,
    page,
    paymentFilter,
    setPage,
    setDateFrom,
    setDateTo,
    setPaymentFilter,
    setTransactionTypeFilter,
    resetCurrentMonth,
    summary,
    transferDraft,
    transferPending: Boolean(pending),
    transferMoney,
    transferring,
    transactionTypeFilter,
    transactions,
  };
}

function cashDateError(from: string, to: string): string {
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to))) {
    return "Укажите корректную дату.";
  }
  if (from && to && from > to) {
    return "Начало периода не может быть позже его окончания.";
  }
  return "";
}

function normalizeCashSummary(summary: CashSummary): CashSummary {
  return {
    ...initialCashSummary,
    ...summary,
    balances: {
      ...initialCashSummary.balances,
      ...summary.balances,
    },
  };
}
