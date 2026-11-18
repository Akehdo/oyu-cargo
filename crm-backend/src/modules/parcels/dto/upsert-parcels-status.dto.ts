import { IsEnum } from "class-validator";

import { ParcelStatus } from "../../../prisma/generated";
import { IsTrackNumberList } from "../../../shared/validation";

export class UpsertParcelsStatusDto {
  @IsTrackNumberList()
  track_numbers!: string[];

  @IsEnum(ParcelStatus, { message: "invalid value" })
  status!: ParcelStatus;
}
