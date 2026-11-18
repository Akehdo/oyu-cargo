import { Calculator, FilePlus2, Loader2, Save } from "lucide-react";
import { FormEvent } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";
import {
  calculateTotalPrice,
  formatRecordPrice,
  useEnterNavigation,
} from "../lib/recordForm";
import {
  CreateRecordDraft,
  packagePrices,
  packageTypes,
  paymentTypes,
} from "../types";
import { RecordUnitPriceInput } from "./RecordUnitPriceInput";

type CreateRecordPanelProps = {
  draft: CreateRecordDraft;
  saving: boolean;
  onDraftChange: (patch: Partial<CreateRecordDraft>) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function CreateRecordPanel({
  draft,
  saving,
  onDraftChange,
  onSubmit,
}: CreateRecordPanelProps): JSX.Element {
  const totalPrice = calculateTotalPrice(
    draft.weight,
    draft.price,
    packagePrices[draft.packageType],
  );
  const enterNavigation = useEnterNavigation();

  return (
    <div className="panel tools-panel">
      <PanelHeader icon={<FilePlus2 size={18} />} title="Создать запись" />
      <form className="record-form" onSubmit={onSubmit}>
        <div className="record-fields-grid">
          <label>
            Код клиента
            <input
              {...enterNavigation<HTMLInputElement>(0)}
              inputMode="numeric"
              type="text"
              value={draft.clientCode}
              onChange={(event) =>
                onDraftChange({ clientCode: event.target.value })
              }
            />
          </label>
          <label>
            Вес, кг
            <input
              {...enterNavigation<HTMLInputElement>(1)}
              inputMode="decimal"
              type="text"
              value={draft.weight}
              onChange={(event) =>
                onDraftChange({ weight: event.target.value })
              }
            />
          </label>
          <label>
            Цена за единицу веса
            <RecordUnitPriceInput
              {...enterNavigation<HTMLInputElement>(2)}
              value={draft.price}
              onValueChange={(price) => onDraftChange({ price })}
            />
          </label>
          <label>
            Пакет
            <select
              {...enterNavigation<HTMLSelectElement>(3)}
              value={draft.packageType}
              onChange={(event) =>
                onDraftChange({
                  packageType: event.target
                    .value as CreateRecordDraft["packageType"],
                })
              }
            >
              {packageTypes.map((packageType) => (
                <option key={packageType.value} value={packageType.value}>
                  {packageType.label}
                </option>
              ))}
            </select>
          </label>
          <div className="record-total" aria-live="polite">
            <Calculator aria-hidden="true" size={24} />
            <span>Итоговая цена</span>
            <strong>{formatRecordPrice(totalPrice)}</strong>
          </div>
        </div>

        <fieldset className="payment-fields">
          <legend>Оплата</legend>
          <div className="payment-fields-grid">
            {paymentTypes.map((paymentType) => (
              <label key={paymentType.value}>
                {paymentType.label}
                <input
                  {...enterNavigation<HTMLInputElement>(
                    4 + paymentTypes.indexOf(paymentType),
                  )}
                  inputMode="decimal"
                  type="text"
                  value={draft.payments[paymentType.value]}
                  onChange={(event) =>
                    onDraftChange({
                      payments: {
                        ...draft.payments,
                        [paymentType.value]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          Трек-номера
          <textarea
            {...enterNavigation<HTMLTextAreaElement>(7)}
            rows={7}
            value={draft.trackNumbers}
            onChange={(event) =>
              onDraftChange({
                trackNumbers: fixTrackKeyboardLayout(event.target.value),
              })
            }
            placeholder="По одному в строке или через запятую"
          />
        </label>

        <button
          {...enterNavigation<HTMLButtonElement>(8)}
          className="primary-button"
          disabled={saving}
          type="submit"
        >
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Сохранить
        </button>
      </form>
    </div>
  );
}
