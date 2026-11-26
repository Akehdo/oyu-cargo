import { Transform, Type } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { CLIENT_CODE_MAX, CLIENT_CODE_MIN } from "../client-code";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class RegisterClientDto {
  @Transform(trim)
  @IsString({ message: "invalid value" })
  @MinLength(2, { message: "name must be at least 2 characters" })
  @MaxLength(100, { message: "name is too long" })
  name!: string;

  @Transform(trim)
  @IsEmail({}, { message: "Введите действительный адрес электронной почты." })
  @MaxLength(255, { message: "Адрес электронной почты слишком длинный." })
  email!: string;

  @IsString({ message: "invalid value" })
  @IsNotEmpty({ message: "field is required" })
  @MaxLength(30, { message: "invalid value" })
  phone!: string;

  @IsString({ message: "invalid value" })
  @MinLength(6, { message: "password must be at least 6 characters" })
  @MaxLength(72, { message: "password is too long" })
  password!: string;

  @IsBoolean({ message: "invalid value" })
  @Equals(true, { message: "terms must be accepted" })
  accept_terms!: unknown;

  // Missing versions from older clients get the same 409 as a stale version.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  terms_version?: string;

  /** A code the client already had; omitted = assign a new random code. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Личный код должен состоять из 5 цифр." })
  @Min(CLIENT_CODE_MIN, { message: "Личный код должен состоять из 5 цифр." })
  @Max(CLIENT_CODE_MAX, { message: "Личный код должен состоять из 5 цифр." })
  existing_code?: number;
}

export class TelegramInitDataDto {
  @IsString({ message: "invalid value" })
  @IsNotEmpty({ message: "field is required" })
  @MaxLength(4096, { message: "invalid value" })
  init_data!: string;
}

export class ClientLoginDto {
  @IsString({ message: "invalid value" })
  @IsNotEmpty({ message: "field is required" })
  @MaxLength(30, { message: "invalid value" })
  phone!: string;

  @IsString({ message: "invalid value" })
  @IsNotEmpty({ message: "field is required" })
  @MaxLength(72, { message: "invalid value" })
  password!: string;
}
