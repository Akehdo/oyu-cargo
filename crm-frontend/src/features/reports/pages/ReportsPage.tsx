import {
  CalendarRange,
  ChartNoAxesCombined,
  Loader2,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MetricCard } from "../../../shared/components/MetricCard";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { businessMonthToDate, isCalendarDate } from "../../../shared/utils/businessDate";
import { readableError } from "../../../shared/utils/errors";
import { useAuth } from "../../auth/context/AuthContext";
import { paymentTypes } from "../../records/types";
import type { ReportDateRange, SalesReport } from "../types";

export function ReportsPage(): JSX.Element {
  const { api } = useAuth();
  const [initialRange] = useState(getCurrentMonthRange);
  const [range, setRange] = useState(initialRange);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadReport = useCallback(
    async (dates: ReportDateRange) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError("");
      setReport(null);

      try {
        const query = new URLSearchParams({
          date_from: dates.dateFrom,
          date_to: dates.dateTo,
        });
        const result = await api<SalesReport>(
          `/reports/sales?${query.toString()}`,
        );
        if (currentRequest === requestId.current) {
          setReport(result);
        }
      } catch (err) {
        if (currentRequest === requestId.current) {
          setError(readableError(err));
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    void loadReport(initialRange);
    return () => {
      requestId.current += 1;
    };
  }, [initialRange, loadReport]);

  const changeRange = (dates: ReportDateRange) => {
    setRange(dates);
    setReport(null);
    setError("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCalendarDate(range.dateFrom) || !isCalendarDate(range.dateTo)) {
      setError("Укажите начало и конец периода.");
      return;
    }
    if (range.dateFrom > range.dateTo) {
      setError("Начало периода не может быть позже его окончания.");
      return;
    }
    void loadReport(range);
  };

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Отчёты</div>
          <h1>Отчёт по продажам</h1>
        </div>
      </header>

      <section className="panel list-panel">
        <PanelHeader icon={<CalendarRange size={18} />} title="Период отчёта" />
        <form className="report-date-filters" onSubmit={submit}>
          <label>
            С
            <input
              type="date"
              required
              max={range.dateTo || undefined}
              value={range.dateFrom}
              disabled={loading}
              onChange={(event) =>
                changeRange({ ...range, dateFrom: event.target.value })
              }
            />
          </label>
          <label>
            По
            <input
              type="date"
              required
              min={range.dateFrom || undefined}
              value={range.dateTo}
              disabled={loading}
              onChange={(event) =>
                changeRange({ ...range, dateTo: event.target.value })
              }
            />
          </label>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <ChartNoAxesCombined size={16} />
            )}
            Сформировать
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={loading}
            onClick={() => changeRange(getCurrentMonthRange())}
          >
            Текущий месяц
          </button>
        </form>
        <p className="report-note">
          Обе даты включены. Выдачи учитываются по дате создания, по времени
          Кызылорды (UTC+5).
        </p>
      </section>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="table-state" role="status">
          <Loader2 className="spin" size={22} />
          Формируем отчёт
        </div>
      )}
      {!loading && !report && !error && (
        <div className="table-state">
          Выберите период и нажмите «Сформировать».
        </div>
      )}
      {!loading && report && (
        <section className="report-results" aria-label="Результаты отчёта">
          <div className="report-period">
            <h2>
              С {formatReportDate(report.date_from)} по{" "}
              {formatReportDate(report.date_to)}
            </h2>
            <p className="report-note">Одна продажа — одна запись выдачи.</p>
          </div>
          {report.sales_count === 0 && (
            <div className="notice">За выбранный период продаж нет.</div>
          )}
          <div className="stats-grid cash-summary-grid">
            <MetricCard
              label="Количество продаж"
              value={formatNumber(report.sales_count, 0)}
            />
            <MetricCard
              label="Сумма продаж"
              value={formatMoney(report.total_sales)}
            />
            <MetricCard
              label="Выдано кг"
              value={`${formatNumber(report.total_weight, 10)} кг`}
            />
            <MetricCard
              label="Средняя цена за кг"
              value={formatMoney(report.average_price_per_kg)}
            />
          </div>
          <p className="report-note">
            Средняя цена за кг = сумма продаж ÷ общий вес выдач. Сумма включает
            стоимость пакетов.
          </p>

          <section className="panel list-panel">
            <PanelHeader
              icon={<WalletCards size={18} />}
              title="Разбивка по оплатам"
            />
            <div className="table-wrap">
              <table className="report-payments-table">
                <thead>
                  <tr>
                    <th scope="col">Способ оплаты</th>
                    <th scope="col">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTypes.map((paymentType) => (
                    <tr key={paymentType.value}>
                      <td>{paymentType.label}</td>
                      <td>
                        {formatMoney(
                          report.payments.find(
                            (payment) =>
                              payment.payment_type === paymentType.value,
                          )?.amount ?? 0,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Итого</th>
                    <td>{formatMoney(report.total_sales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </section>
      )}
    </main>
  );
}

function getCurrentMonthRange(): ReportDateRange {
  return businessMonthToDate();
}

function formatReportDate(value: string): string {
  return value.split("-").reverse().join(".");
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(
    value,
  );
}

function formatMoney(value: number): string {
  return `${formatNumber(value, 2)} ₸`;
}
