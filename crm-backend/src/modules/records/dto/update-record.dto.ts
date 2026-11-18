import {
  IfProvided,
  IsMoneyLimit,
  IsTrackNumberList,
} from "../../../shared/validation";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from "class-validator";

import { PackageType, PaymentType } from "../../../prisma/generated";
import { RecordPaymentDto } from "./create-record.dto";

export class UpdateRecordDto {
  @IfProvided()
  @IsISO8601({ strict: true, strictSeparator: true })
  expected_updated_at?: string;

  @IfProvided()
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  confirm_track_reassignment?: boolean;

  @IfProvided()
  @Type(() => Number)
  @IsInt({ message: "invalid value" })
  @Min(1, { message: "invalid value" })
  client_code?: number;

  @IfProvided()
  @IsTrackNumberList()
  track_numbers?: string[];

  @IfProvided()
  @Type(() => Number)
  @IsNumber({}, { message: "invalid value" })
  @Min(0.0000001, { message: "invalid value" })
  weight?: number;

  @IfProvided()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "invalid value" })
  @Min(0.01, { message: "invalid value" })
  @IsMoneyLimit()
  price?: number;

  @IfProvided()
  @IsEnum(PackageType, { message: "invalid value" })
  package_type?: PackageType;

  @IfProvided()
  @IsEnum(PaymentType, { message: "invalid value" })
  payment_type?: PaymentType;

  @IfProvided()
  @IsArray({ message: "invalid value" })
  @ArrayMinSize(1, { message: "invalid value" })
  @ValidateNested({ each: true })
  @Type(() => RecordPaymentDto)
  payments?: RecordPaymentDto[];
}
