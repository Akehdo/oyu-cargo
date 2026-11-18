import { Check } from "lucide-react";
import { getStatusMeta, TRACK_STEPS } from "../../../config/statuses";

/** 5-step progress: Склад Китай → В пути → Алматы → Кокшетау → Выдано. */
export function TrackProgress({ status }: { status: string }): JSX.Element {
  const meta = getStatusMeta(status);
  // The final step ("Выдано") is shown as completed, not "in progress".
  const step = meta.step >= TRACK_STEPS.length - 1 ? TRACK_STEPS.length : meta.step;

  return (
    <ol className="track-progress" aria-label="Этапы доставки">
      {TRACK_STEPS.map((label, index) => {
        const state =
          index < step ? "done" : index === step ? "current" : "upcoming";

        return (
          <li key={label} className={`step-${state}`}>
            <span className="step-dot">
              {state === "done" ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
