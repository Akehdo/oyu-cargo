import { Dispatch, SetStateAction } from "react";
import { ListMeta, Parcel, StatusFilter } from "../types";
import { ParcelFilters } from "./ParcelFilters";
import { ParcelTable } from "./ParcelTable";

type ParcelTablePanelProps = {
  filter: StatusFilter;
  loading: boolean;
  meta: ListMeta;
  page: number;
  parcels: Parcel[];
  setFilter: Dispatch<SetStateAction<StatusFilter>>;
  setPage: Dispatch<SetStateAction<number>>;
  onParcelOpen: (parcel: Parcel) => Promise<void>;
};

export function ParcelTablePanel(props: ParcelTablePanelProps): JSX.Element {
  return (
    <section className="panel list-panel">
      <div className="list-head">
        <ParcelFilters
          filter={props.filter}
          setFilter={props.setFilter}
          setPage={props.setPage}
        />
      </div>
      <ParcelTable
        loading={props.loading}
        meta={props.meta}
        page={props.page}
        parcels={props.parcels}
        setPage={props.setPage}
        onParcelOpen={props.onParcelOpen}
      />
    </section>
  );
}
