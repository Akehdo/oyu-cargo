import { ChevronDown, ChevronUp } from "lucide-react";
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { parseDecimalInput } from "../../../shared/utils/number";

type RecordUnitPriceInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  onValueChange: (value: string) => void;
  value: string;
};

const UNIT_PRICE_STEP = 50;

export const RecordUnitPriceInput = forwardRef<
  HTMLInputElement,
  RecordUnitPriceInputProps
>(function RecordUnitPriceInput(
  { className, onValueChange, value, ...inputProps },
  ref,
): JSX.Element {
  const numericValue = parseDecimalInput(value);
  const cannotDecrease =
    Number.isFinite(numericValue) && numericValue <= UNIT_PRICE_STEP;

  const changePrice = (direction: -1 | 1) => {
    const currentValue =
      Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
    const nextValue = Math.max(
      UNIT_PRICE_STEP,
      currentValue + direction * UNIT_PRICE_STEP,
    );

    onValueChange(String(nextValue));
  };

  return (
    <div className="record-unit-price-stepper">
      <input
        {...inputProps}
        ref={ref}
        className={["record-unit-price-input", className]
          .filter(Boolean)
          .join(" ")}
        inputMode="decimal"
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <div className="record-unit-price-stepper-controls">
        <button
          aria-label="Увеличить цену на 50"
          tabIndex={-1}
          title="Увеличить цену"
          type="button"
          onClick={() => changePrice(1)}
        >
          <ChevronUp aria-hidden="true" size={20} />
        </button>
        <button
          aria-label="Уменьшить цену на 50"
          disabled={cannotDecrease}
          tabIndex={-1}
          title="Уменьшить цену"
          type="button"
          onClick={() => changePrice(-1)}
        >
          <ChevronDown aria-hidden="true" size={20} />
        </button>
      </div>
    </div>
  );
});
