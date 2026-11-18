import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/context/AuthContext";
import { usePersistedState } from "../../../shared/hooks/usePersistedState";
import { readableError } from "../../../shared/utils/errors";
import { parseDecimalInput } from "../../../shared/utils/number";
import {
  createExpenseRequest,
  deleteExpenseRequest,
  listExpensesRequest,
  updateExpenseRequest,
} from "../api/expensesApi";
import type {
  CreateExpenseDraft,
  CreateExpensePayload,
  ExpenseEntity,
  ListMeta,
  UpdateExpenseDraft,
  UpdateExpensePayload,
} from "../types";
import { initialCreateExpenseDraft, initialUpdateExpenseDraft } from "../types";

export type ExpenseSavingState = "" | "create" | "update" | "delete";

type PayloadResult<TPayload> =
  { ok: true; payload: TPayload } | { ok: false; error: string };

export function useExpensesDashboard() {
  const { api } = useAuth();
  const [createDraft, setCreateDraft] = usePersistedState<CreateExpenseDraft>(
    "crm.expenses.createDraft",
    initialCreateExpenseDraft,
  );
  const [updateDraft, setUpdateDraft] = usePersistedState<UpdateExpenseDraft>(
    "crm.expenses.updateDraft",
    initialUpdateExpenseDraft,
  );
  const [page, setPage] = usePersistedState("crm.expenses.page", 1);
  const [expenses, setExpenses] = useState<ExpenseEntity[]>([]);
  const [meta, setMeta] = useState<ListMeta>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<ExpenseSavingState>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const changeCreateDraft = (patch: Partial<CreateExpenseDraft>) => {
    setCreateDraft((current) => ({ ...current, ...patch }));
  };

  const changeUpdateDraft = (patch: Partial<UpdateExpenseDraft>) => {
    setUpdateDraft((current) => ({ ...current, ...patch }));
  };

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await listExpensesRequest(api, { page });
      setExpenses(payload.items ?? []);
      setMeta(payload.meta ?? { page, limit: 20, total: 0, total_pages: 0 });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const createExpense = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const result = buildCreatePayload(createDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaving("create");
    setError("");
    setNotice("");

    try {
      const expense = await createExpenseRequest(api, result.payload);
      setCreateDraft(initialCreateExpenseDraft);
      setNotice(`Расход создан: ${expense.id}`);
      if (page === 1) {
        await loadExpenses();
      } else {
        setPage(1);
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const updateExpense = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const id = updateDraft.id.trim();
    if (!id) {
      setError("Укажите ID расхода.");
      return;
    }

    const result = buildUpdatePayload(updateDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaving("update");
    setError("");
    setNotice("");

    try {
      const expense = await updateExpenseRequest(api, id, result.payload);
      setUpdateDraft(initialUpdateExpenseDraft);
      setNotice(`Расход обновлен: ${expense.id}`);
      await loadExpenses();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const selectExpenseForUpdate = (expense: ExpenseEntity) => {
    setUpdateDraft({
      id: expense.id,
      amount: String(expense.amount),
      comment: expense.comment,
      paymentType: expense.payment_type,
    });
    setError("");
    setNotice(`Расход выбран для обновления: ${expense.id}`);
  };

  const deleteExpense = async (id: string) => {
    setSaving("delete");
    setError("");
    setNotice("");

    try {
      const expense = await deleteExpenseRequest(api, id);
      if (updateDraft.id.trim() === expense.id) {
        setUpdateDraft(initialUpdateExpenseDraft);
      }

      setNotice(`Расход удален: ${expense.id}`);
      if (expenses.length === 1 && page > 1) {
        setPage(Math.max(1, page - 1));
      } else {
        await loadExpenses();
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  return {
    changeCreateDraft,
    changeUpdateDraft,
    createDraft,
    createExpense,
    deleteExpense,
    error,
    expenses,
    loading,
    meta,
    notice,
    page,
    saving,
    selectExpenseForUpdate,
    setPage,
    updateDraft,
    updateExpense,
  };
}

function buildCreatePayload(
  draft: CreateExpenseDraft,
): PayloadResult<CreateExpensePayload> {
  const amount = parseDecimalInput(draft.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Укажите сумму больше нуля." };
  }

  return {
    ok: true,
    payload: {
      amount,
      comment: normalizeComment(draft.comment),
      payment_type: draft.paymentType,
    },
  };
}

function buildUpdatePayload(
  draft: UpdateExpenseDraft,
): PayloadResult<UpdateExpensePayload> {
  const payload: UpdateExpensePayload = {};

  if (draft.amount.trim()) {
    const amount = parseDecimalInput(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Сумма должна быть больше нуля." };
    }

    payload.amount = amount;
  }

  if (draft.comment.trim()) {
    payload.comment = normalizeComment(draft.comment);
  }

  if (draft.paymentType) {
    payload.payment_type = draft.paymentType;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "Заполните хотя бы одно поле для обновления." };
  }

  return { ok: true, payload };
}

function normalizeComment(comment: string): string {
  return comment.trim();
}
