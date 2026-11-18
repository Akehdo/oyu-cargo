import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";

import { Transaction } from "../../prisma/generated";
import { createPaginationMeta } from "../../shared/pagination";
import { toMoneyNumber } from "../../shared/money";
import { TelegramService } from "../../telegram/telegram.service";
import { AdminOnly } from "../auth/decorators/auth.decorator";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { ListTransactionsDto } from "./dto/list-transactions.dto";
import { TransactionsService } from "./transactions.service";

@Controller("transactions")
@AdminOnly()
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly telegram: TelegramService,
  ) {}

  @Post("transfer")
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @Body() dto: CreateTransferDto,
    @Headers("idempotency-key") key: string,
  ) {
    const transfer = await this.transactions.transfer(dto, key);
    if (!transfer.replayed)
      void this.telegram.notifyTransfer(
        dto.amount,
        dto.from_payment_type,
        dto.to_payment_type,
        transfer.expense.id,
        transfer.income.id,
      );

    return {
      expense: transactionResponse(transfer.expense),
      income: transactionResponse(transfer.income),
    };
  }

  @Get()
  async list(@Query() dto: ListTransactionsDto) {
    const result = await this.transactions.list(dto);

    return {
      items: result.items.map(transactionResponse),
      meta: createPaginationMeta(result.page, result.limit, result.total),
      summary: result.summary,
    };
  }
}

function transactionResponse(transaction: Transaction) {
  return {
    amount: toMoneyNumber(transaction.amount),
    created_at: transaction.createdAt,
    expense_id: transaction.expenseId,
    id: transaction.id,
    payment_type: transaction.paymentType,
    record_id: transaction.recordId,
    transaction_type: transaction.transactionType,
    updated_at: transaction.updatedAt,
  };
}
