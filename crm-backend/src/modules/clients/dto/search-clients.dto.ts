import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SearchClientsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString({ message: "invalid value" })
  @MaxLength(100, { message: "invalid value" })
  q?: string;

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
