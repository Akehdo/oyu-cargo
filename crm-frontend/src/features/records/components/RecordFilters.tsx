import type { Dispatch, SetStateAction } from "react";
import { PaymentFilter, paymentTypes } from "../types";

type RecordFiltersProps = {
  filter: PaymentFilter;
  setFilter: Dispatch<SetStateAction<PaymentFilter>>;
  setPage: Dispatch<SetStateAction<number>>;
};

export function RecordFilters({
  filter,
  setFilter,
  setPage,
}: RecordFiltersProps): JSX.Element {
  const selectFilter = (nextFilter: PaymentFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="tabs" role="tablist" aria-label="Фильтр оплаты">
      <button
        className={filter === "all" ? "active" : ""}
        type="button"
        onClick={() => selectFilter("all")}
      >
        Все
      </button>
      {paymentTypes.map((paymentType) => (
        <button
          className={filter === paymentType.value ? "active" : ""}
          key={paymentType.value}
          type="button"
          onClick={() => selectFilter(paymentType.value)}
        >
          {paymentType.label}
        </button>
      ))}
    </div>
  );
}
