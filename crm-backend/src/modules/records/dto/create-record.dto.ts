import {
  IfProvided,
  IsMoneyLimit,
  IsTrackNumberList,
} from "../../../shared/validation";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";

import { PackageType, PaymentType } from "../../../prisma/generated";

export class RecordPaymentDto {
  @IsEnum(PaymentType, { message: "invalid value" })
  payment_type!: PaymentType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "invalid value" })
  @Min(0.01, { message: "invalid value" })
  @IsMoneyLimit()
  amount!: number;
}

export class CreateRecordDto {
  @IfProvided()
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  confirm_track_reassignment?: boolean;

  @Type(() => Number)
  @IsInt({ message: "invalid value" })
  @Min(1, { message: "field is required" })
  client_code!: number;

  @IsTrackNumberList()
  track_numbers!: string[];

  @Type(() => Number)
  @IsNumber({}, { message: "invalid value" })
  @Min(0.0000001, { message: "invalid value" })
  weight!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "invalid value" })
  @Min(0.01, { message: "invalid value" })
  @IsMoneyLimit()
  price!: number;

  @IsOptional()
  @IsEnum(PackageType, { message: "invalid value" })
  package_type?: PackageType;

  @IsOptional()
  @IsEnum(PaymentType, { message: "invalid value" })
  payment_type?: PaymentType;

  @IsOptional()
  @IsArray({ message: "invalid value" })
  @ArrayMinSize(1, { message: "field is required" })
  @ValidateNested({ each: true })
  @Type(() => RecordPaymentDto)
  payments?: RecordPaymentDto[];
}
