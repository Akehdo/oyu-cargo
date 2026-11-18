import { IfProvided, IsMoneyLimit } from "../../../shared/validation";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsString, MaxLength, Min } from "class-validator";

import { PaymentType } from "../../../prisma/generated";

export class UpdateExpenseDto {
  @IfProvided()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "invalid value" })
  @Min(0.01, { message: "invalid value" })
  @IsMoneyLimit()
  amount?: number;

  @IfProvided()
  @IsEnum(PaymentType, { message: "invalid value" })
  payment_type?: PaymentType;

  @IfProvided()
  @IsString({ message: "invalid value" })
  @MaxLength(255, { message: "invalid value" })
  comment?: string;
}
