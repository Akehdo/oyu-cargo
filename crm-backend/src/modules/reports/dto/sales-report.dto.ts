import { IsCalendarDate } from "../../../shared/validation";

export class SalesReportDto {
  @IsCalendarDate("дату начала периода")
  date_from!: string;

  @IsCalendarDate("дату окончания периода")
  date_to!: string;
}
