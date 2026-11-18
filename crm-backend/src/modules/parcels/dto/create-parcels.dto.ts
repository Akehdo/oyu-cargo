import { IsTrackNumberList } from "../../../shared/validation";

export class CreateParcelsDto {
  @IsTrackNumberList()
  track_numbers!: string[];
}
