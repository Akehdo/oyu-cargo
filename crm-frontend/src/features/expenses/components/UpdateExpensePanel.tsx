import { FilePenLine, Loader2, Save } from "lucide-react";
import type { FormEvent } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { paymentTypeLabels, UpdateExpenseDraft } from "../types";

type UpdateExpensePanelProps = {
  draft: UpdateExpenseDraft;
  saving: boolean;
  onDraftChange: (patch: Partial<UpdateExpenseDraft>) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function UpdateExpensePanel({
  draft,
  saving,
  onDraftChange,
  onSubmit,
}: UpdateExpensePanelProps): JSX.Element {
  return (
    <div className="panel tools-panel">
      <PanelHeader icon={<FilePenLine size={18} />} title="Обновить расход" />
      <form className="record-form" onSubmit={onSubmit}>
        <label>
          ID расхода
          <input
            value={draft.id}
            onChange={(event) => onDraftChange({ id: event.target.value })}
            placeholder="UUID расхода"
          />
        </label>
        <label>
          Сумма
          <input
            inputMode="decimal"
            type="text"
            value={draft.amount}
            onChange={(event) => onDraftChange({ amount: event.target.value })}
          />
        </label>
        <label>
          Тип оплаты
          <select
            value={draft.paymentType}
            onChange={(event) =>
              onDraftChange({
                paymentType: event.target
                  .value as UpdateExpenseDraft["paymentType"],
              })
            }
          >
            <option value="">Не менять</option>
            {Object.entries(paymentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Комментарий
          <textarea
            maxLength={255}
            rows={5}
            value={draft.comment}
            onChange={(event) => onDraftChange({ comment: event.target.value })}
            placeholder="Оставьте пустым, чтобы не менять"
          />
        </label>
        <button className="secondary-button" disabled={saving} type="submit">
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Обновить
        </button>
      </form>
    </div>
  );
}
