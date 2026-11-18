import { Archive, LoaderCircle, PackageOpen, Plus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { support } from "../../config/content";
import { ApiError, errorText } from "../../shared/api/http";
import type { ClientTrack, ClientTracksResponse } from "../../shared/api/types";
import { Modal } from "../../shared/components/Modal";
import { EmptyState, ErrorState, Spinner } from "../../shared/components/States";
import { usePersistedState } from "../../shared/hooks/usePersistedState";
import { normalizeTrackInput } from "../../shared/utils/trackNumbers";
import { useAuth } from "../auth/context/AuthContext";
import { useMe } from "../me/MeContext";
import { TrackCard } from "./components/TrackCard";

type TracksView = "active" | "archived";

const COMMENT_MAX_LENGTH = 100;

export function TracksPage(): JSX.Element {
  const { api } = useAuth();
  const { reload: reloadMe } = useMe();
  const [view, setView] = usePersistedState<TracksView>(
    "cargo.client.tracks.view",
    "active",
  );
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: ClientTracksResponse;
    error?: string;
  } | null>(null);
  const [toDelete, setToDelete] = useState<ClientTrack | null>(null);
  const archived = view === "archived";

  const key = `${view}:${page}:${revision}`;
  const response = result?.key === key ? result : null;
  const items = response?.data?.items ?? [];
  const error = response?.error;
  const loading = response === null;
  const totalPages = response?.data?.meta.total_pages ?? 0;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        const payload = await api<ClientTracksResponse>(
          `/client/tracks?archived=${archived}&page=${page}&limit=20`,
          { signal },
        );
        if (signal.aborted) return;
        if (page > Math.max(1, payload.meta.total_pages)) {
          setPage(Math.max(1, payload.meta.total_pages));
          return;
        }
        setResult({ key, data: payload });
      } catch (caught) {
        if (!signal.aborted) setResult({ key, error: errorText(caught, "Не удалось загрузить посылки") });
      }
    }
    void load();
    return () => controller.abort();
  }, [api, archived, key, page]);

  const refresh = () => setRevision((previous) => previous + 1);
  const handleChange = () => {
    refresh();
    void reloadMe();
  };
  const selectView = (next: TracksView) => {
    setPage(1);
    setView(next);
  };

  return (
    <div className="page tracks-page">
      <aside className="tracks-aside">
        <AddTrackForm onAdded={handleChange} />
      </aside>

      <div className="tracks-main">
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!archived}
          className={!archived ? "active" : ""}
          onClick={() => selectView("active")}
        >
          Активные
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={archived}
          className={archived ? "active" : ""}
          onClick={() => selectView("archived")}
        >
          Корзина — выданные
        </button>
      </div>

      {loading && !items.length ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error && !items.length ? (
        archived ? (
          <EmptyState
            icon={<Archive size={28} />}
            title="Корзина пуста"
            text="Здесь появятся посылки, которые вы уже получили."
          />
        ) : (
          <EmptyState
            icon={<PackageOpen size={28} />}
            title="Пока нет посылок"
            text="Добавьте трек-номер из приложения магазина — и следите за доставкой здесь."
          />
        )
      ) : null}

      <div className="track-list">
        {items.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            onDelete={archived ? undefined : setToDelete}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <nav className="button-row" aria-label="Страницы посылок">
          <button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button>
          <span>{page} / {totalPages}</span>
          <button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Вперёд</button>
        </nav>
      )}
      </div>

      <DeleteTrackDialog
        track={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={handleChange}
      />
    </div>
  );
}

function AddTrackForm({
  onAdded,
}: {
  onAdded: () => void;
}): JSX.Element {
  const { api } = useAuth();
  const [trackNumber, setTrackNumber] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeTrackInput(trackNumber);
    setTrackNumber(normalized);
    setError("");
    setConflict(false);
    setNotice("");

    if (!normalized) {
      setError("Введите трек-номер.");
      return;
    }

    setBusy(true);
    try {
      const trimmedComment = comment.trim();
      const track = await api<ClientTrack>("/client/tracks", {
        method: "POST",
        body: {
          track_number: normalized,
          ...(trimmedComment ? { comment: trimmedComment } : {}),
        },
      });
      setTrackNumber("");
      setComment("");
      setNotice(
        track.archived
          ? `Трек ${track.track_number} уже выдан — он сразу попал в «Корзину».`
          : `Трек ${track.track_number} добавлен.`,
      );
      onAdded();
    } catch (caught) {
      const isConflict = caught instanceof ApiError && caught.status === 409;
      setConflict(isConflict);
      setError(
        isConflict
          ? `Трек ${normalized} уже добавлен — вами или другим клиентом. Если это ваша посылка, напишите нам в WhatsApp, мы разберёмся.`
          : errorText(caught, "Не удалось добавить трек"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card add-track-form" onSubmit={handleSubmit}>
      <div className="card-title">
        <span className="card-icon">
          <Plus size={20} />
        </span>
        <h2>Добавить трек-номер</h2>
      </div>
      <label>
        Трек-номер
        <input
          value={trackNumber}
          placeholder="Например, YT1234567890"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setTrackNumber(event.target.value)}
          onBlur={() => setTrackNumber((value) => normalizeTrackInput(value))}
        />
      </label>
      <label>
        Что за товар (необязательно)
        <input
          value={comment}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Например, кроссовки"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {error ? (
        <p className="alert">
          {error}
          {conflict ? (
            <>
              {" "}
              <a href={support.whatsappUrl} target="_blank" rel="noreferrer">
                Написать
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}
      <button type="submit" className="primary-button" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
        Добавить
      </button>
    </form>
  );
}

function DeleteTrackDialog({
  track,
  onClose,
  onDeleted,
}: {
  track: ClientTrack | null;
  onClose: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setBusy(false);
  }, [track]);

  const handleDelete = async () => {
    if (!track) return;
    setBusy(true);
    setError("");
    try {
      await api(`/client/tracks/${encodeURIComponent(track.id)}`, {
        method: "DELETE",
      });
      onDeleted();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 400
          ? "Этот трек уже выдан или в архиве — удалить его нельзя."
          : errorText(caught, "Не удалось удалить трек"),
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(track)}
      title="Удалить трек?"
      variant="dialog"
      onClose={onClose}
      footer={
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            Удалить
          </button>
        </div>
      }
    >
      <p>
        Трек <strong>{track?.track_number}</strong> будет удалён из вашего
        списка. Удаляйте только ошибочно добавленные номера.
      </p>
      {error ? <p className="alert">{error}</p> : null}
    </Modal>
  );
}
