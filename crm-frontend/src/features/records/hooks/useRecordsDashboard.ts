import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/context/AuthContext";
import { usePersistedState } from "../../../shared/hooks/usePersistedState";
import { readableError } from "../../../shared/utils/errors";
import { ApiError } from "../../../shared/api/http";
import { parseDecimalInput } from "../../../shared/utils/number";
import {
  createRecordRequest,
  deleteRecordRequest,
  getRecordRequest,
  listDailyTrackNumbersRequest,
  listRecordsRequest,
  updateRecordRequest,
} from "../api/recordsApi";
import { parseRecordTracks } from "../lib/trackNumbers";
import { calculateTotalPrice, totalPriceToUnitPrice } from "../lib/recordForm";
import type {
  CreateRecordDraft,
  CreateRecordPayload,
  ListMeta,
  PaymentDraft,
  PaymentFilter,
  PackageType,
  RecordEntity,
  RecordPayment,
  UpdateRecordDraft,
  UpdateRecordPayload,
} from "../types";
import { businessToday, isCalendarDate } from "../../../shared/utils/businessDate";
import {
  initialPaymentDraft,
  initialRecordDraft,
  initialUpdateRecordDraft,
  packagePrices,
} from "../types";

export type RecordSavingState = "" | "create" | "update" | "delete";

type PayloadResult<TPayload> =
  { ok: true; payload: TPayload } | { ok: false; error: string };

export function useRecordsDashboard() {
  const { api } = useAuth();
  const [createDraft, setCreateDraft] = usePersistedState<CreateRecordDraft>(
    "crm.records.createDraft",
    initialRecordDraft,
  );
  const [updateDraft, setUpdateDraft] = usePersistedState<UpdateRecordDraft>(
    "crm.records.updateDraft",
    initialUpdateRecordDraft,
  );
  const [filter, setFilter] = usePersistedState<PaymentFilter>(
    "crm.records.paymentFilter",
    "all",
  );
  const [page, setPage] = usePersistedState("crm.records.page", 1);
  const [records, setRecords] = useState<RecordEntity[]>([]);
  const [meta, setMeta] = useState<ListMeta>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<RecordSavingState>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dailyTracksOpen, setDailyTracksOpen] = useState(false);
  const [dailyTrackDate, setDailyTrackDate] = useState(() => businessToday());
  const [dailyTrackNumbers, setDailyTrackNumbers] = useState<string[]>([]);
  const [dailyTracksLoading, setDailyTracksLoading] = useState(false);
  const [dailyTracksError, setDailyTracksError] = useState("");
  const selection = useRef(0);
  const normalizedCreateDraft = normalizeCreateRecordDraft(createDraft);
  const normalizedUpdateDraft = normalizeUpdateRecordDraft(updateDraft);

  useEffect(() => {
    setCreateDraft((current) =>
      current.price?.trim()
        ? current
        : { ...current, price: initialRecordDraft.price },
    );
  }, [setCreateDraft]);

  const changeCreateDraft = (patch: Partial<CreateRecordDraft>) => {
    setCreateDraft((current) => ({
      ...normalizeCreateRecordDraft(current),
      ...patch,
    }));
  };

  const changeUpdateDraft = (patch: Partial<UpdateRecordDraft>) => {
    if (patch.id !== undefined && patch.id !== updateDraft.id) {
      selection.current += 1;
      setUpdateDraft({ ...initialUpdateRecordDraft, id: patch.id });
      return;
    }
    setUpdateDraft((current) => ({
      ...normalizeUpdateRecordDraft(current),
      ...patch,
    }));
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await listRecordsRequest(api, {
        page,
        paymentType: filter,
      });
      setRecords(payload.items ?? []);
      setMeta(payload.meta ?? { page, limit: 20, total: 0, total_pages: 0 });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [api, filter, page]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const loadDailyTrackNumbers = async (date = dailyTrackDate) => {
    if (!isCalendarDate(date)) {
      setDailyTracksError("Укажите корректную дату.");
      return;
    }
    setDailyTracksLoading(true);
    setDailyTracksError("");

    try {
      const payload = await listDailyTrackNumbersRequest(api, date);
      setDailyTrackNumbers(payload.track_numbers ?? []);
    } catch (err) {
      setDailyTrackNumbers([]);
      setDailyTracksError(readableError(err));
    } finally {
      setDailyTracksLoading(false);
    }
  };

  const openDailyTracks = async () => {
    setDailyTracksOpen(true);
    await loadDailyTrackNumbers();
  };

  const changeDailyTrackDate = (date: string) => {
    setDailyTrackDate(date);
    setDailyTrackNumbers([]);
    setDailyTracksError("");
  };

  const createRecord = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const result = buildCreatePayload(normalizedCreateDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaving("create");
    setError("");
    setNotice("");

    try {
      const record = await withOwnerConfirmation((confirmed) => createRecordRequest(api, {
        ...result.payload,
        ...(confirmed && { confirm_track_reassignment: true }),
      }));
      if (!record) return;
      setCreateDraft(initialRecordDraft);
      setNotice(`Запись создана: ${record.id}`);
      if (page === 1) {
        await loadRecords();
      } else {
        setPage(1);
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const updateRecord = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const id = normalizedUpdateDraft.id.trim();
    if (!id) {
      setError("Укажите ID записи.");
      return;
    }

    const result = buildUpdatePayload(normalizedUpdateDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const current = selection.current;
    setSaving("update");
    setError("");
    setNotice("");

    try {
      const record = await withOwnerConfirmation((confirmed) => updateRecordRequest(api, id, {
        ...result.payload,
        ...(confirmed && { confirm_track_reassignment: true }),
      }));
      if (!record) return;
      if (current === selection.current) setUpdateDraft(initialUpdateRecordDraft);
      setNotice(`Запись обновлена: ${record.id}`);
      await loadRecords();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "STALE_RECORD"
        ? "Запись изменил другой оператор. Загрузите актуальную запись и проверьте изменения."
        : readableError(err));
    } finally {
      setSaving("");
    }
  };

  const selectRecordForUpdate = (record: RecordEntity) => {
    selection.current += 1;
    const packageType = record.package_type ?? "none";

    setUpdateDraft({
      id: record.id,
      original: record,
      clientCode: String(record.client_code),
      trackNumbers: record.track_numbers.join("\n"),
      weight: String(record.weight),
      price: totalPriceToUnitPrice(
        record.price,
        record.weight,
        packagePrices[packageType],
      ),
      packageType,
      payments: paymentsToDraft(
        record.payments,
        record.price,
        record.payment_type,
      ),
    });
    setError("");
    setNotice(`Запись выбрана для обновления: ${record.id}`);
    requestAnimationFrame(() => {
      document.getElementById("record-update-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const reloadRecord = async () => {
    const id = updateDraft.id.trim();
    if (!id) return;
    const current = ++selection.current;
    setSaving("update");
    setError("");
    try {
      const record = await getRecordRequest(api, id);
      if (current === selection.current) selectRecordForUpdate(record);
    } catch (err) {
      if (current === selection.current) setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const deleteRecord = async (id: string) => {
    setSaving("delete");
    setError("");
    setNotice("");

    try {
      const record = await withOwnerConfirmation((confirmed) => deleteRecordRequest(api, id, confirmed));
      if (!record) return;
      if (normalizedUpdateDraft.id.trim() === record.id) {
        setUpdateDraft(initialUpdateRecordDraft);
      }

      setNotice(`Запись удалена: ${record.id}`);

      if (records.length === 1 && page > 1) {
        setPage(Math.max(1, page - 1));
      } else {
        await loadRecords();
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
    createDraft: normalizedCreateDraft,
    createRecord,
    changeDailyTrackDate,
    dailyTrackDate,
    dailyTrackNumbers,
    dailyTracksError,
    dailyTracksLoading,
    dailyTracksOpen,
    error,
    filter,
    loading,
    loadDailyTrackNumbers,
    meta,
    notice,
    page,
    records,
    reloadRecord,
    saving,
    deleteRecord,
    selectRecordForUpdate,
    setDailyTracksOpen,
    setFilter,
    setPage,
    updateDraft: normalizedUpdateDraft,
    updateRecord,
    openDailyTracks,
  };
}

function normalizeCreateRecordDraft(
  draft: CreateRecordDraft,
): CreateRecordDraft {
  const legacyDraft = draft as CreateRecordDraft & {
    paymentType?: keyof PaymentDraft;
  };

  return {
    ...initialRecordDraft,
    ...draft,
    packageType: normalizePackageType(draft.packageType, "none"),
    payments: normalizePaymentDraft(draft.payments, {
      amount: draft.price,
      paymentType: legacyDraft.paymentType,
    }),
  };
}

function normalizeUpdateRecordDraft(
  draft: UpdateRecordDraft,
): UpdateRecordDraft {
  const legacyDraft = draft as UpdateRecordDraft & {
    paymentType?: keyof PaymentDraft;
  };

  return {
    ...initialUpdateRecordDraft,
    ...draft,
    packageType: normalizePackageType(draft.packageType, ""),
    payments: normalizePaymentDraft(draft.payments, {
      amount: draft.price,
      paymentType: legacyDraft.paymentType,
    }),
  };
}

function normalizePackageType<TFallback extends "none" | "">(
  packageType: PackageType | "" | undefined,
  fallback: TFallback,
): PackageType | TFallback {
  return packageType === "none" ||
    packageType === "large" ||
    packageType === "medium" ||
    packageType === "small"
    ? packageType
    : fallback;
}

function normalizePaymentDraft(
  payments?: Partial<PaymentDraft>,
  fallback?: { amount?: string; paymentType?: keyof PaymentDraft },
): PaymentDraft {
  const normalized: PaymentDraft = {
    ...initialPaymentDraft,
    ...payments,
  };

  if (!hasPaymentValues(payments) && fallback?.amount && fallback.paymentType) {
    normalized[fallback.paymentType] = fallback.amount;
  }

  return normalized;
}

function hasPaymentValues(payments?: Partial<PaymentDraft>): boolean {
  return Object.values(payments ?? {}).some((value) => Boolean(value?.trim()));
}

function buildCreatePayload(
  draft: CreateRecordDraft,
): PayloadResult<CreateRecordPayload> {
  const clientCode = Number(draft.clientCode);
  const weight = parseDecimalInput(draft.weight);
  const unitPrice = parseDecimalInput(draft.price);
  const totalPrice = calculateTotalPrice(
    draft.weight,
    draft.price,
    packagePrices[draft.packageType],
  );
  const trackNumbers = parseRecordTracks(draft.trackNumbers);
  const payments = buildPaymentsPayload(draft.payments);

  if (!Number.isFinite(clientCode) || clientCode <= 0) {
    return { ok: false, error: "Укажите код клиента." };
  }

  if (trackNumbers.length === 0) {
    return { ok: false, error: "Добавьте хотя бы один трек-номер." };
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    return { ok: false, error: "Укажите вес больше нуля." };
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, error: "Укажите цену за единицу веса больше нуля." };
  }

  if (totalPrice === null || totalPrice <= 0) {
    return { ok: false, error: "Итоговая цена должна быть больше нуля." };
  }

  if (!payments) {
    return { ok: false, error: "Укажите сумму оплаты с точностью до двух знаков после запятой." };
  }
  if (payments.length === 0) {
    return { ok: false, error: "Укажите хотя бы одну оплату." };
  }

  if (!isSameAmount(paymentsTotal(payments), totalPrice)) {
    return {
      ok: false,
      error: "Сумма оплат должна совпадать с итоговой ценой.",
    };
  }

  return {
    ok: true,
    payload: {
      client_code: clientCode,
      track_numbers: trackNumbers,
      weight,
      price: totalPrice,
      package_type: draft.packageType,
      payments,
    },
  };
}

function buildUpdatePayload(
  draft: UpdateRecordDraft,
): PayloadResult<UpdateRecordPayload> {
  const original = draft.original;
  if (!original?.updated_at || original.id !== draft.id.trim()) {
    return { ok: false, error: "Загрузите актуальную запись по ID перед редактированием." };
  }
  const changes: Partial<CreateRecordPayload> = {};

  if (draft.clientCode.trim()) {
    const clientCode = Number(draft.clientCode);
    if (!Number.isFinite(clientCode) || clientCode <= 0) {
      return { ok: false, error: "Код клиента должен быть больше нуля." };
    }

    if (clientCode !== original.client_code) {
      changes.client_code = clientCode;
    }
  }

  if (draft.trackNumbers.trim()) {
    const trackNumbers = parseRecordTracks(draft.trackNumbers);
    if (trackNumbers.length === 0) {
      return { ok: false, error: "Добавьте хотя бы один трек-номер." };
    }

    if (
      trackNumbers.length !== original.track_numbers.length ||
      trackNumbers.some((track, i) => track !== original.track_numbers[i])
    ) {
      changes.track_numbers = trackNumbers;
    }
  }

  if (draft.weight.trim()) {
    const weight = parseDecimalInput(draft.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return { ok: false, error: "Вес должен быть больше нуля." };
    }

    if (weight !== original.weight) {
      changes.weight = weight;
    }
  }

  const originalPackage = original.package_type ?? "none";
  const selectedPackage = draft.packageType || originalPackage;
  if (selectedPackage !== originalPackage) {
    changes.package_type = selectedPackage;
  }
  const initialUnitPrice = totalPriceToUnitPrice(
    original.price, original.weight, packagePrices[originalPackage],
  );
  const unitPrice = draft.price.trim() || initialUnitPrice;
  if (
    changes.weight !== undefined || changes.package_type !== undefined ||
    parseDecimalInput(unitPrice) !== Number(initialUnitPrice)
  ) {
    const totalPrice = calculateTotalPrice(
      String(changes.weight ?? original.weight),
      unitPrice,
      packagePrices[selectedPackage],
    );
    if (totalPrice === null || totalPrice <= 0) {
      return { ok: false, error: "Укажите корректные вес и цену для расчёта." };
    }

    if (totalPrice !== original.price) {
      changes.price = totalPrice;
    }
  }

  const initialPayments = paymentsToDraft(original.payments, original.price, original.payment_type);
  const paymentsChanged = Object.entries(draft.payments).some(([key, value]) =>
    parseDecimalInput(value.trim() || "0") !==
    parseDecimalInput(initialPayments[key as keyof PaymentDraft].trim() || "0"));
  if (paymentsChanged || changes.price !== undefined) {
    const payments = buildPaymentsPayload(draft.payments);
    if (!payments) {
      return { ok: false, error: "Укажите сумму оплаты с точностью до двух знаков после запятой." };
    }
    if (payments.length === 0 || !isSameAmount(paymentsTotal(payments), changes.price ?? original.price)) {
      return {
        ok: false,
        error: "Сумма оплат должна совпадать с итоговой ценой.",
      };
    }

    if (paymentsChanged) {
      changes.payments = payments;
    }
  }

  if (Object.keys(changes).length === 0) {
    return { ok: false, error: "Изменений для сохранения нет." };
  }

  return { ok: true, payload: { ...changes, expected_updated_at: original.updated_at } };
}

async function withOwnerConfirmation(
  save: (confirmed: boolean) => Promise<RecordEntity>,
): Promise<RecordEntity | null> {
  try {
    return await save(false);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409 || err.code !== "TRACK_OWNER_CONFLICT") {
      throw err;
    }
    const tracks = err.trackNumbers?.join(", ") ?? "";
    const warning = [
      err.message,
      tracks,
      "Прежняя привязка будет снята. Личные заметки прежнего владельца не передаются новому клиенту.",
      "Если новый код не зарегистрирован, трек останется только в выдаче.",
      "Подтвердить перенос?",
    ].filter(Boolean).join("\n");
    if (!window.confirm(warning)) {
      return null;
    }
    return save(true);
  }
}

function buildPaymentsPayload(payments: PaymentDraft): RecordPayment[] | null {
  const entries: RecordPayment[] = [];
  for (const [paymentType, value] of Object.entries(payments)) {
    const amount = parseDecimalInput(value.trim() || "0");
    if (!Number.isFinite(amount) || amount < 0 || amount !== Number(amount.toFixed(2))) {
      return null;
    }
    if (amount > 0) {
      entries.push({ amount, payment_type: paymentType as RecordPayment["payment_type"] });
    }
  }
  return entries;
}

function paymentsTotal(payments: RecordPayment[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function isSameAmount(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function paymentsToDraft(
  payments: RecordPayment[] | undefined,
  price: number,
  fallbackPaymentType: RecordPayment["payment_type"],
): PaymentDraft {
  const draft: PaymentDraft = { cash: "", card: "", kaspiQR: "" };
  const sourcePayments =
    payments && payments.length > 0
      ? payments
      : [{ amount: price, payment_type: fallbackPaymentType }];

  for (const payment of sourcePayments) {
    draft[payment.payment_type] = String(payment.amount);
  }

  return draft;
}
