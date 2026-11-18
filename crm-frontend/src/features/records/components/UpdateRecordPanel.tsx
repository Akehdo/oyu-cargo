import { Calculator, FilePenLine, Loader2, Save } from "lucide-react";
import type { FormEvent } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";
import {
  calculateTotalPrice,
  formatRecordPrice,
  useEnterNavigation,
} from "../lib/recordForm";
import {
  packagePrices,
  packageTypes,
  paymentTypes,
  UpdateRecordDraft,
} from "../types";
import { RecordUnitPriceInput } from "./RecordUnitPriceInput";

type UpdateRecordPanelProps = {
  draft: UpdateRecordDraft;
  saving: boolean;
  onDraftChange: (patch: Partial<UpdateRecordDraft>) => void;
  onReload: () => Promise<void>;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function UpdateRecordPanel({
  draft,
  saving,
  onDraftChange,
  onReload,
  onSubmit,
}: UpdateRecordPanelProps): JSX.Element {
  const totalPrice = calculateTotalPrice(
    draft.weight,
    draft.price,
    draft.packageType ? packagePrices[draft.packageType] : 0,
  );
  const enterNavigation = useEnterNavigation();

  return (
    <div className="panel tools-panel" id="record-update-panel">
      <PanelHeader icon={<FilePenLine size={18} />} title="Обновить запись" />
      <form className="record-form" onSubmit={onSubmit}>
        <label>
          ID записи
          <input
            {...enterNavigation<HTMLInputElement>(0)}
            value={draft.id}
            onChange={(event) => onDraftChange({ id: event.target.value })}
            placeholder="UUID записи"
          />
        </label>

        <button
          className="secondary-button"
          type="button"
          disabled={!draft.id.trim() || saving}
          onClick={() => void onReload()}
        >
          Загрузить актуальную запись
        </button>
        {draft.original && (
          <>
            <div className="record-fields-grid">
              <label>
                Код клиента
                <input
                  {...enterNavigation<HTMLInputElement>(1)}
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
                  {...enterNavigation<HTMLInputElement>(2)}
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
                  {...enterNavigation<HTMLInputElement>(3)}
                  value={draft.price}
                  onValueChange={(price) => onDraftChange({ price })}
                />
              </label>
              <label>
                Пакет
                <select
                  {...enterNavigation<HTMLSelectElement>(4)}
                  value={draft.packageType}
                  onChange={(event) =>
                    onDraftChange({
                      packageType: event.target
                        .value as UpdateRecordDraft["packageType"],
                    })
                  }
                >
                  <option value="">Не менять</option>
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
                        5 + paymentTypes.indexOf(paymentType),
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
                {...enterNavigation<HTMLTextAreaElement>(8)}
                rows={7}
                value={draft.trackNumbers}
                onChange={(event) =>
                  onDraftChange({
                    trackNumbers: fixTrackKeyboardLayout(event.target.value),
                  })
                }
                placeholder="Оставьте пустым, чтобы не менять"
              />
            </label>

            <button
              {...enterNavigation<HTMLButtonElement>(9)}
              className="secondary-button"
              disabled={saving}
              type="submit"
            >
              {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              Обновить
            </button>
          </>
        )}
      </form>
    </div>
  );
}
