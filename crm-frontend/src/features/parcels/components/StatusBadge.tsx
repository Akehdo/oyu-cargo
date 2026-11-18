import { ParcelStatus, parcelStatusLabels } from "../types";

type StatusBadgeProps = {
  status: ParcelStatus;
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`status-badge status-${status}`}>
      {parcelStatusLabels[status]}
    </span>
  );
}
