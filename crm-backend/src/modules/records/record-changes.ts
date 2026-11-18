import { TransactionType } from "../../prisma/generated";
import { toMoneyNumber } from "../../shared/money";
import { RecordWithTransactions } from "./types/records.types";

export function changedRecordFields(
  before: RecordWithTransactions,
  after: RecordWithTransactions,
): string[] {
  const previous = comparableRecord(before);
  const current = comparableRecord(after);
  return (Object.keys(previous) as (keyof typeof previous)[]).filter(
    (field) => previous[field] !== current[field],
  );
}

function comparableRecord(record: RecordWithTransactions) {
  const income = record.transactions?.filter(
    (transaction) => transaction.transactionType === TransactionType.INCOME,
  );
  // Compare payment values, ignoring recreated transaction IDs and row order.
  const payments = income?.length
    ? income
    : [{ paymentType: record.paymentType, amount: record.price }];
  const trackNumbers = Array.isArray(record.trackNumbers)
    ? record.trackNumbers.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    client_code: record.clientCode.toString(),
    track_numbers: JSON.stringify([...new Set(trackNumbers)].sort()),
    weight: record.weight,
    price: toMoneyNumber(record.price),
    package_type: record.packageType,
    payment_type: record.paymentType,
    payments: JSON.stringify(
      payments
        .map((payment) => [payment.paymentType, toMoneyNumber(payment.amount)])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ),
  };
}
