import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { Expense } from "../../prisma/generated";
import { createPaginationMeta } from "../../shared/pagination";
import { toMoneyNumber } from "../../shared/money";
import { TelegramService } from "../../telegram/telegram.service";
import { AdminOnly } from "../auth/decorators/auth.decorator";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { ListExpensesDto } from "./dto/list-expenses.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpensesService } from "./expenses.service";

@Controller("expenses")
@AdminOnly()
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly telegram: TelegramService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExpenseDto) {
    const expense = await this.expenses.create(dto);
    void this.telegram.notifyExpenseCreated(expense);
    return expenseResponse(expense);
  }

  @Get()
  async list(@Query() dto: ListExpensesDto) {
    const result = await this.expenses.list(dto.page, dto.limit);

    return {
      items: result.items.map(expenseResponse),
      meta: createPaginationMeta(result.page, result.limit, result.total),
    };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    const { changedFields, expense } = await this.expenses.update(id, dto);
    if (changedFields.length > 0) {
      void this.telegram.notifyExpenseUpdated(expense, changedFields);
    }
    return expenseResponse(expense);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async delete(@Param("id", new ParseUUIDPipe()) id: string) {
    const expense = await this.expenses.delete(id);
    void this.telegram.notifyExpenseDeleted(expense);
    return expenseResponse(expense);
  }
}

function expenseResponse(expense: Expense) {
  return {
    amount: toMoneyNumber(expense.amount),
    comment: expense.comment,
    created_at: expense.createdAt,
    id: expense.id,
    payment_type: expense.paymentType,
    updated_at: expense.updatedAt,
  };
}
