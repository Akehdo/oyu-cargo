import { IsCalendarDate } from "../../../shared/validation";

export class ListRecordTrackNumbersDto {
  @IsCalendarDate("дату выдачи")
  date!: string;
}
