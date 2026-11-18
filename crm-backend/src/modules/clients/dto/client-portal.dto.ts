import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ListClientTracksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(["true", "false"], { message: "invalid value" })
  archived?: "true" | "false";
}

export class AddClientTrackDto {
  @Transform(trim)
  @IsString({ message: "invalid value" })
  @MinLength(4, { message: "track number is too short" })
  @MaxLength(64, { message: "track number is too long" })
  @Matches(/^\S+$/, { message: "track number must not contain spaces" })
  track_number!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: "invalid value" })
  @MaxLength(100, { message: "comment is too long" })
  comment?: string;
}

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "invalid value" })
  @Min(1, { message: "invalid value" })
  @Max(100, { message: "invalid value" })
  limit?: number;
}

export class MarkNotificationsReadDto {
  @IsOptional()
  @IsArray({ message: "invalid value" })
  @ArrayMaxSize(200, { message: "too many ids" })
  @IsUUID("all", { each: true, message: "invalid value" })
  ids?: string[];
}
