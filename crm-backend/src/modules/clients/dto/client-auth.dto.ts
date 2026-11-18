import { Transform } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class RegisterClientDto {
  @Transform(trim)
  @IsString({ message: "invalid value" })
  @MinLength(2, { message: "name must be at least 2 characters" })
  @MaxLength(100, { message: "name is too long" })
  name!: string;

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
