import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/context/AuthContext";
import { findTrackOwnerRequest } from "../../clients/api/clientsApi";
import type { TrackOwner } from "../../clients/types";
import { findRecordByTrackNumberRequest } from "../../records/api/recordsApi";
import type { RecordEntity } from "../../records/types";
import { ApiError } from "../../../shared/api/http";
import { usePersistedState } from "../../../shared/hooks/usePersistedState";
import { readableError } from "../../../shared/utils/errors";
import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";
import {
  ListMeta,
  ListParcelsResponse,
  Parcel,
  ParcelStatus,
  StatusFilter,
} from "../types";
import { parseTracks } from "../lib/trackNumbers";

export type SavingState = "" | "create" | "status" | "search";

export function useParcelsDashboard() {
  const { api } = useAuth();
  const [filter, setFilter] = usePersistedState<StatusFilter>(
    "crm.parcels.filter",
    "all",
  );
  const [page, setPage] = usePersistedState("crm.parcels.page", 1);
  const [createDraft, setCreateDraft] = usePersistedState(
    "crm.parcels.createDraft",
    "",
  );
  const [statusDraft, setStatusDraft] = usePersistedState(
    "crm.parcels.statusDraft",
    "",
  );
  const [statusTarget, setStatusTarget] = usePersistedState<ParcelStatus>(
    "crm.parcels.statusTarget",
    "shipped",
  );
  const [searchTrack, setSearchTrack] = usePersistedState(
    "crm.parcels.search",
    "",
  );
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [meta, setMeta] = useState<ListMeta>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const searchRequest = useRef(0);
  useEffect(() => () => { searchRequest.current += 1; }, []);
  const [selection, setSelection] = useState<{
    track: string;
    parcel: Parcel | null;
    record: RecordEntity | null;
    owner: TrackOwner | null;
    recordMissing: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<SavingState>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });

    if (filter !== "all") {
      params.set("status", filter);
    }

    return params.toString();
  }, [filter, page]);

  const loadParcels = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await api<ListParcelsResponse>(`/parcels?${query}`);
      setParcels(payload.items ?? []);
      setMeta(payload.meta ?? { page, limit: 20, total: 0, total_pages: 0 });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [api, page, query]);

  useEffect(() => {
    loadParcels();
  }, [loadParcels]);

  const createParcels = async () => {
    const trackNumbers = parseTracks(createDraft);
    if (trackNumbers.length === 0) {
      setError("Добавьте хотя бы один трек-номер.");
      return;
    }

    setSaving("create");
    setError("");
    setNotice("");

    try {
      const result = await api<{ created: number; skipped: number }>("/parcels", {
        method: "POST",
        body: { track_numbers: trackNumbers },
      });
      setCreateDraft("");
      setNotice(`Добавлено: ${result.created}. Пропущено: ${result.skipped}.`);
      if (page === 1) {
        await loadParcels();
      } else {
        setPage(1);
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const updateStatuses = async () => {
    const trackNumbers = parseTracks(statusDraft);
    if (trackNumbers.length === 0) {
      setError("Добавьте трек-номера для обновления.");
      return;
    }

    setSaving("status");
    setError("");
    setNotice("");

    try {
      const result = await api<{
        created: number;
        skipped: string[];
        updated: number;
      }>("/parcels/status", {
        method: "PUT",
        body: { track_numbers: trackNumbers, status: statusTarget },
      });
      const skipped = result.skipped ?? [];
      // Parcels of an issuance keep "issued": keep them in the draft so the
      // operator sees exactly which tracks were not changed.
      setStatusDraft(skipped.join("\n"));
      setNotice(
        [
          `Обновлено: ${result.updated ?? 0}`,
          `новых: ${result.created ?? 0}`,
          skipped.length > 0
            ? `пропущено выданных: ${skipped.length} (измените или удалите выдачу)`
            : "",
        ]
          .filter(Boolean)
          .join(", "),
      );
      await loadParcels();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving("");
    }
  };

  const lookupTrack = async (
    track: string,
    knownParcel?: Parcel,
    onRecordOpen?: (record: RecordEntity) => void,
  ) => {
    const current = ++searchRequest.current;
    setSelection(null);
    setError("");
    setNotice("");
    if (!track) {
      setSaving("");
      return;
    }

    setSaving("search");
    const [parcel, record, owner] = await Promise.allSettled([
      knownParcel ? Promise.resolve(knownParcel) : api<Parcel>(`/parcels/${encodeURIComponent(track)}`),
      findRecordByTrackNumberRequest(api, track),
      findTrackOwnerRequest(api, track),
    ]);
    if (current !== searchRequest.current) return;
    setSaving("");
    const selectedRecord = record.status === "fulfilled" ? record.value : null;
    setSelection({
      track,
      parcel: parcel.status === "fulfilled" ? parcel.value : null,
      record: selectedRecord,
      owner: owner.status === "fulfilled" ? owner.value : null,
      recordMissing: record.status === "rejected" && isNotFound(record.reason),
    });
    if (onRecordOpen && selectedRecord) {
      onRecordOpen(selectedRecord);
      return;
    }
    const errors: string[] = [];
    if (parcel.status === "rejected" && !isNotFound(parcel.reason)) {
      errors.push(`Не удалось загрузить посылку. ${readableError(parcel.reason)}`);
    }
    if (record.status === "rejected" && !isNotFound(record.reason)) {
      errors.push(`Не удалось проверить выдачу. ${readableError(record.reason)}`);
    }
    if (owner.status === "rejected" && !isNotFound(owner.reason)) {
      errors.push(`Не удалось определить владельца. ${readableError(owner.reason)}`);
    }
    if (errors.length) {
      setError(errors.join(" "));
    } else if (parcel.status === "rejected" && owner.status === "fulfilled") {
      setNotice("Посылка ещё не поступила на склад, но клиент уже добавил трек.");
    } else if (parcel.status === "rejected") {
      setError(readableError(parcel.reason));
    }
    if (knownParcel) {
      requestAnimationFrame(() => {
        if (current === searchRequest.current) {
          document.getElementById("parcel-search-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  };

  const findTrack = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    return lookupTrack(fixTrackKeyboardLayout(searchTrack.trim()));
  };

  const openRecordForParcel = (parcel: Parcel, onRecordOpen: (record: RecordEntity) => void) => {
    setSearchTrack(parcel.track_number);
    return lookupTrack(parcel.track_number, parcel, onRecordOpen);
  };

  const changeSearchTrack = (value: string) => {
    searchRequest.current += 1;
    setSelection(null);
    setSaving("");
    setError("");
    setNotice("");
    setSearchTrack(value);
  };

  const selected = selection?.track === fixTrackKeyboardLayout(searchTrack.trim()) ? selection : null;

  return {
    createDraft,
    createParcels,
    error,
    filter,
    findTrack,
    loadParcels,
    loading,
    meta,
    notice,
    openRecordForParcel,
    page,
    parcels,
    saving,
    searchTrack,
    selectedParcel: selected?.parcel ?? null,
    selectedRecord: selected?.record ?? null,
    trackOwner: selected?.owner ?? null,
    recordMissing: selected?.recordMissing ?? false,
    setCreateDraft,
    setFilter,
    setPage,
    setSearchTrack: changeSearchTrack,
    setStatusDraft,
    setStatusTarget,
    statusDraft,
    statusTarget,
    updateStatuses,
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
