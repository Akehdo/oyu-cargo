import { Check, Clipboard, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DailyTrackNumbersDialogProps = {
  date: string;
  error: string;
  loading: boolean;
  open: boolean;
  trackNumbers: string[];
  onClose: () => void;
  onDateChange: (date: string) => void;
  onLoad: () => Promise<void>;
};

export function DailyTrackNumbersDialog({
  date,
  error,
  loading,
  open,
  trackNumbers,
  onClose,
  onDateChange,
  onLoad,
}: DailyTrackNumbersDialogProps): JSX.Element | null {
  const [copyState, setCopyState] = useState<"" | "copied" | "error">("");
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const text = trackNumbers.join("\n");

  useEffect(() => {
    setCopyState("");
  }, [date, text]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const copyTracks = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      outputRef.current?.focus();
      outputRef.current?.select();
      setCopyState("error");
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="daily-tracks-title"
        aria-modal="true"
        className="dialog-panel daily-tracks-dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <h2 id="daily-tracks-title">Треки за день</h2>
            <p>Все трек-номера из записей, по одному в строке.</p>
          </div>
          <button
            aria-label="Закрыть"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="daily-tracks-filter">
          <label>
            Дата
            <input
              type="date"
              disabled={loading}
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={loading || !date}
            type="button"
            onClick={() => void onLoad()}
          >
            {loading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            Показать
          </button>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <label>
          Найдено: {trackNumbers.length}
          <textarea
            className="daily-tracks-output"
            readOnly
            ref={outputRef}
            rows={12}
            value={text}
            placeholder={loading ? "Загрузка..." : "За этот день треков нет"}
          />
        </label>

        <button
          className="primary-button"
          disabled={loading || trackNumbers.length === 0}
          type="button"
          onClick={() => void copyTracks()}
        >
          {copyState === "copied" ? <Check size={18} /> : <Clipboard size={18} />}
          {copyState === "copied" ? "Скопировано" : "Скопировать все"}
        </button>
        {copyState === "error" ? (
          <div className="alert">
            Автокопирование недоступно. Текст выделен — нажмите Ctrl+C.
          </div>
        ) : null}
      </section>
    </div>
  );
}
