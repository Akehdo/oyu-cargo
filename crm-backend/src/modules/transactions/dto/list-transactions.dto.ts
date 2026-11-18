import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

import { PaymentType, TransactionType } from "../../../prisma/generated";
import { IsCalendarDate } from "../../../shared/validation";

export class ListTransactionsDto {
  @IsOptional()
  @IsEnum(TransactionType, { message: "invalid value" })
  transaction_type?: TransactionType;

  @IsOptional()
  @IsEnum(PaymentType, { message: "invalid value" })
  payment_type?: PaymentType;

  @IsOptional()
  @IsCalendarDate("дату начала периода")
  date_from?: string;

  @IsOptional()
  @IsCalendarDate("дату окончания периода")
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "invalid value" })
  @Min(1, { message: "invalid value" })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "invalid value" })
  @Min(1, { message: "invalid value" })
  @Max(100, { message: "invalid value" })
  limit?: number;
}
