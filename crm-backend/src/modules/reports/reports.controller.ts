import { Controller, Get, Query } from "@nestjs/common";

import { AdminOnly } from "../auth/decorators/auth.decorator";
import { SalesReportDto } from "./dto/sales-report.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@AdminOnly()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("sales")
  sales(@Query() dto: SalesReportDto) {
    return this.reports.sales(dto.date_from, dto.date_to);
  }
}
