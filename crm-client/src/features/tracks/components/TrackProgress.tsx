import { Check } from "lucide-react";
import { getStatusMeta, TRACK_STEP_STATUSES, TRACK_STEPS } from "../../../config/statuses";
import type { ClientTrack } from "../../../shared/api/types";
import { formatDateTime, formatShortDate } from "../../../shared/utils/format";

/**
 * 5-step progress: Склад Китай → В пути → Алматы → Кокшетау → Выдано,
 * with the date each reached step was reached under its label.
 */
export function TrackProgress({
  status,
  dates,
}: {
  status: string;
  dates?: ClientTrack["status_dates"];
}): JSX.Element {
  const meta = getStatusMeta(status);
  // The final step ("Выдано") is shown as completed, not "in progress".
  const step = meta.step >= TRACK_STEPS.length - 1 ? TRACK_STEPS.length : meta.step;

  return (
    <ol className="track-progress" aria-label="Этапы доставки">
      {TRACK_STEPS.map((label, index) => {
        const state =
          index < step ? "done" : index === step ? "current" : "upcoming";
        // Upcoming steps have no date; skipped or old steps may have none either.
        const value = state === "upcoming" ? null : dates?.[TRACK_STEP_STATUSES[index]] ?? null;
        const shortDate = formatShortDate(value);

        return (
          <li key={label} className={`step-${state}`}>
            <span className="step-dot">
              {state === "done" ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span className="step-label">{label}</span>
            {shortDate && value ? (
              <time className="step-date" dateTime={value} title={formatDateTime(value)}>
                {shortDate}
              </time>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
