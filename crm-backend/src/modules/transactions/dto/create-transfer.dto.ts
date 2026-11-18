import { IsMoneyLimit } from "../../../shared/validation";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, Min } from "class-validator";

import { PaymentType } from "../../../prisma/generated";

export class CreateTransferDto {
  @IsEnum(PaymentType, { message: "invalid value" })
  from_payment_type!: PaymentType;

  @IsEnum(PaymentType, { message: "invalid value" })
  to_payment_type!: PaymentType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "invalid value" })
  @Min(0.01, { message: "invalid value" })
  @IsMoneyLimit()
  amount!: number;
}
