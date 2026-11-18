import { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
};

export function MetricCard({ label, value }: MetricCardProps): JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
