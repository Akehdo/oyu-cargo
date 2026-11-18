import { Banknote, Loader2, Save } from "lucide-react";
import type { FormEvent } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { CreateExpenseDraft, paymentTypeLabels } from "../types";

type CreateExpensePanelProps = {
  draft: CreateExpenseDraft;
  saving: boolean;
  onDraftChange: (patch: Partial<CreateExpenseDraft>) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function CreateExpensePanel({
  draft,
  saving,
  onDraftChange,
  onSubmit,
}: CreateExpensePanelProps): JSX.Element {
  return (
    <div className="panel tools-panel">
      <PanelHeader icon={<Banknote size={18} />} title="Создать расход" />
      <form className="record-form" onSubmit={onSubmit}>
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
                  .value as CreateExpenseDraft["paymentType"],
              })
            }
          >
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
            placeholder="За что списали деньги"
          />
        </label>
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Сохранить
        </button>
      </form>
    </div>
  );
}
