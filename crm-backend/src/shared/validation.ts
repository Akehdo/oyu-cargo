import { applyDecorators } from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from "class-validator";

import { calendarDateTimestamp } from "./business-day";
import { MAX_MONEY } from "./money";

export const MAX_TRACKS_PER_REQUEST = 2000;
export const MAX_TRACK_LENGTH = 100;

/** Omitted PATCH fields are allowed. Explicit null still goes through validation. */
export function IfProvided() {
  return ValidateIf((_object, value) => value !== undefined);
}

export function IsCalendarDate(field: string) {
  return ValidateBy(
    {
      name: "isCalendarDate",
      validator: {
        validate: (value: unknown) => calendarDateTimestamp(value) !== null,
      },
    },
    { message: `Укажите корректную ${field} в формате ГГГГ-ММ-ДД.` },
  );
}

/** A list of track numbers: 1..2000 non-empty strings up to 100 characters. */
export function IsTrackNumberList() {
  return applyDecorators(
    IsArray({ message: "invalid value" }),
    ArrayMinSize(1, { message: "field is required" }),
    ArrayMaxSize(MAX_TRACKS_PER_REQUEST, {
      message: `no more than ${MAX_TRACKS_PER_REQUEST} track numbers per request`,
    }),
    IsString({ each: true, message: "invalid value" }),
    IsNotEmpty({ each: true, message: "field is required" }),
    MaxLength(MAX_TRACK_LENGTH, {
      each: true,
      message: `track number must be at most ${MAX_TRACK_LENGTH} characters`,
    }),
  );
}

/** Upper bound that fits DECIMAL(12, 2). */
export function IsMoneyLimit() {
  return Max(MAX_MONEY, { message: "amount is too large" });
}
