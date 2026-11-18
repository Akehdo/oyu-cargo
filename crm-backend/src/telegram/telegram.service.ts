import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  Expense,
  ParcelStatus,
  PaymentType,
  Record as RecordModel,
  Transaction,
  TransactionType,
} from "../prisma/generated";
import { toMoneyNumber } from "../shared/money";

const TELEGRAM_MESSAGE_LIMIT = 3_900;

const paymentTypeLabels: Record<PaymentType, string> = {
  [PaymentType.card]: "Карта",
  [PaymentType.cash]: "Наличные",
  [PaymentType.kaspiQR]: "Kaspi QR",
};

const parcelStatusLabels: Record<ParcelStatus, string> = {
  [ParcelStatus.added]: "Добавлена",
  [ParcelStatus.shipped]: "Отправлена",
  [ParcelStatus.almaty]: "Алматы",
  [ParcelStatus.koksh]: "Кокшетау",
  [ParcelStatus.issued]: "Выдана",
};

const fieldLabels: Record<string, string> = {
  amount: "сумма",
  client_code: "код клиента",
  comment: "комментарий",
  package_type: "тип упаковки",
  payment_type: "касса",
  payments: "оплата",
  price: "стоимость",
  track_numbers: "трек-номера",
  weight: "вес",
};

type RecordWithTransactions = RecordModel & {
  transactions?: Transaction[];
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(config: ConfigService) {
    this.botToken = config.get<string>("TELEGRAM_BOT_TOKEN")?.trim() ?? "";
    this.chatId = config.get<string>("TELEGRAM_CHAT_ID")?.trim() ?? "";
  }

  isEnabled(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  sendMessage(text: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return Promise.resolve(false);
    }

    const operation = this.sendQueue.then(() => this.deliver(text));
    this.sendQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  notifyRecordCreated(record: RecordWithTransactions): Promise<boolean> {
    return this.sendMessage(
      [
        "✅ Новая выдача",
        "",
        `👤 Клиент: ${record.clientCode.toString()}`,
        `🧾 Запись: ${record.id}`,
        `⚖️ Вес: ${record.weight} кг`,
        `💰 Стоимость: ${formatMoney(record.price)}`,
        "",
        `💳 Оплата:\n${formatRecordPayments(record)}`,
        "",
        formatTrackNumbers(record.trackNumbers),
      ].join("\n"),
    );
  }

  notifyRecordUpdated(
    record: RecordWithTransactions,
    changedFields: string[],
  ): Promise<boolean> {
    return this.sendMessage(
      [
        "✏️ Выдача обновлена",
        "",
        `👤 Клиент: ${record.clientCode.toString()}`,
        `🧾 Запись: ${record.id}`,
        `📝 Изменено: ${formatChangedFields(changedFields)}`,
        `💰 Стоимость: ${formatMoney(record.price)}`,
        "",
        `💳 Оплата:\n${formatRecordPayments(record)}`,
        "",
        formatTrackNumbers(record.trackNumbers),
      ].join("\n"),
    );
  }

  notifyRecordDeleted(record: RecordModel): Promise<boolean> {
    return this.sendMessage(
      [
        "🗑️ Выдача удалена",
        "",
        `👤 Клиент: ${record.clientCode.toString()}`,
        `🧾 Запись: ${record.id}`,
        `💰 Стоимость: ${formatMoney(record.price)}`,
        "",
        formatTrackNumbers(record.trackNumbers),
      ].join("\n"),
    );
  }

  notifyExpenseCreated(expense: Expense): Promise<boolean> {
    return this.sendMessage(
      ["💸 Новый расход", formatExpense(expense)].join("\n\n"),
    );
  }

  notifyExpenseUpdated(
    expense: Expense,
    changedFields: string[],
  ): Promise<boolean> {
    return this.sendMessage(
      [
        "✏️ Расход обновлён",
        "",
        `📝 Изменено: ${formatChangedFields(changedFields)}`,
        "",
        formatExpense(expense),
      ].join("\n"),
    );
  }

  notifyExpenseDeleted(expense: Expense): Promise<boolean> {
    return this.sendMessage(
      ["🗑️ Расход удалён", formatExpense(expense)].join("\n\n"),
    );
  }

  notifyTransfer(
    amount: number,
    from: PaymentType,
    to: PaymentType,
    expenseTransactionId: string,
    incomeTransactionId: string,
  ): Promise<boolean> {
    return this.sendMessage(
      [
        "🔄 Перевод между кассами",
        "",
        `💰 Сумма: ${formatMoney(amount)}`,
        `📤 Откуда: ${paymentTypeLabels[from]}`,
        `📥 Куда: ${paymentTypeLabels[to]}`,
        "",
        "🧾 Операции:",
        `Списание: ${expenseTransactionId}`,
        `Зачисление: ${incomeTransactionId}`,
      ].join("\n"),
    );
  }

  notifyParcelsCreated(
    trackNumbers: string[],
    createdCount: number,
  ): Promise<boolean> {
    return this.sendMessage(
      [
        "📦 Посылки добавлены",
        "",
        `✅ Добавлено: ${createdCount}`,
        "",
        formatTrackNumbers(trackNumbers),
      ].join("\n"),
    );
  }

  notifyParcelStatusChanged(
    trackNumbers: string[],
    status: ParcelStatus,
  ): Promise<boolean> {
    return this.sendMessage(
      [
        "🔄 Статус посылок обновлён",
        "",
        `📍 Статус: ${parcelStatusLabels[status]}`,
        `📦 Количество: ${trackNumbers.length}`,
        "",
        formatTrackNumbers(trackNumbers),
      ].join("\n"),
    );
  }

  private async deliver(text: string): Promise<boolean> {
    try {
      for (const chunk of splitTelegramText(text)) {
        const response = await fetch(
          `https://api.telegram.org/bot${this.botToken}/sendMessage`,
          {
            body: JSON.stringify({ chat_id: this.chatId, text: chunk }),
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (!response.ok) {
          const details = (await response.text()).slice(0, 500);
          this.logger.warn(
            `Telegram API returned ${response.status}: ${details}`,
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram message was not sent: ${message}`);
      return false;
    }
  }
}

export function splitTelegramText(
  text: string,
  limit = TELEGRAM_MESSAGE_LIMIT,
): string[] {
  let remaining = text.trim();
  const chunks: string[] = [];

  while (remaining.length > limit) {
    let boundary = remaining.lastIndexOf("\n", limit);

    if (boundary < Math.floor(limit / 2)) {
      boundary = remaining.lastIndexOf(" ", limit);
    }

    if (boundary <= 0) {
      boundary = limit;
    }

    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function formatExpense(expense: Expense): string {
  return [
    `💰 Сумма: ${formatMoney(expense.amount)}`,
    `💳 Касса: ${paymentTypeLabels[expense.paymentType]}`,
    `🧾 Расход: ${expense.id}`,
    "",
    `💬 Комментарий:\n${expense.comment || "—"}`,
  ].join("\n");
}

function formatChangedFields(fields: string[]): string {
  return fields.map((field) => fieldLabels[field] ?? field).join(", ");
}

function formatRecordPayments(record: RecordWithTransactions): string {
  const payments = record.transactions?.filter(
    (transaction) => transaction.transactionType === TransactionType.INCOME,
  );

  if (!payments || payments.length === 0) {
    return `• ${paymentTypeLabels[record.paymentType]} — ${formatMoney(record.price)}`;
  }

  return payments
    .map(
      (payment) =>
        `• ${paymentTypeLabels[payment.paymentType]} — ${formatMoney(payment.amount)}`,
    )
    .join("\n");
}

function formatTrackNumbers(value: unknown): string {
  if (!Array.isArray(value)) {
    return "📦 Трек-номера:\n—";
  }

  const trackNumbers = value.filter(
    (item): item is string => typeof item === "string",
  );
  return `📦 Трек-номера:\n${trackNumbers.length > 0 ? trackNumbers.join("\n") : "—"}`;
}

function formatMoney(value: Parameters<typeof toMoneyNumber>[0]): string {
  return `${toMoneyNumber(value).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ₸`;
}
