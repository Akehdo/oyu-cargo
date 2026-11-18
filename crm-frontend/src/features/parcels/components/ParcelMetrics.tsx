import { MetricCard } from "../../../shared/components/MetricCard";
import { ListMeta } from "../types";

type ParcelMetricsProps = {
  meta: ListMeta;
  visibleCount: number;
};

export function ParcelMetrics({
  meta,
  visibleCount,
}: ParcelMetricsProps): JSX.Element {
  return (
    <section className="stats-grid">
      <MetricCard label="Всего" value={meta.total} />
      <MetricCard
        label="Страница"
        value={`${meta.page}/${Math.max(meta.total_pages, 1)}`}
      />
      <MetricCard label="В выборке" value={visibleCount} />
    </section>
  );
}
