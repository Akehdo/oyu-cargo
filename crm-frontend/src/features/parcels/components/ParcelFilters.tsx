import { Dispatch, SetStateAction } from "react";
import { StatusFilter, parcelStatuses } from "../types";

type ParcelFiltersProps = {
  filter: StatusFilter;
  setFilter: Dispatch<SetStateAction<StatusFilter>>;
  setPage: Dispatch<SetStateAction<number>>;
};

export function ParcelFilters({
  filter,
  setFilter,
  setPage,
}: ParcelFiltersProps): JSX.Element {
  const selectFilter = (nextFilter: StatusFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="tabs" role="tablist" aria-label="Фильтр статуса">
      <button
        className={filter === "all" ? "active" : ""}
        type="button"
        onClick={() => selectFilter("all")}
      >
        Все
      </button>
      {parcelStatuses.map((status) => (
        <button
          className={filter === status.value ? "active" : ""}
          key={status.value}
          type="button"
          onClick={() => selectFilter(status.value)}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}
