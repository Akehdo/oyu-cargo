import { Transform, TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

// Read the original value so implicit conversion cannot turn a numeric phone into a login.
function trimIdentifier({ obj, key }: TransformFnParams): unknown {
  const value: unknown = obj[key];
  return typeof value === "string" ? value.trim() : value;
}

export class LoginDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimIdentifier)
  @IsEmail({}, { message: "must be a valid email" })
  email?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimIdentifier)
  @IsString({ message: "Введите телефон или электронную почту." })
  @IsNotEmpty({ message: "Введите телефон или электронную почту." })
  @MaxLength(255, { message: "Слишком длинный логин." })
  login?: string;

  @IsString({ message: "invalid value" })
  @IsNotEmpty({ message: "field is required" })
  @MaxLength(72, { message: "password is too long" })
  password!: string;
}
