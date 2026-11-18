import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { Parcel } from "../../prisma/generated";
import { AdminOnly } from "../auth/decorators/auth.decorator";
import { CreateParcelsDto } from "./dto/create-parcels.dto";
import { ListParcelsDto } from "./dto/list-parcels.dto";
import { UpsertParcelsStatusDto } from "./dto/upsert-parcels-status.dto";
import { ParcelsService } from "./parcels.service";
import { createPaginationMeta } from "../../shared/pagination";
import { TelegramService } from "../../telegram/telegram.service";

@Controller("parcels")
@AdminOnly()
export class ParcelsController {
  constructor(
    private readonly parcels: ParcelsService,
    private readonly telegram: TelegramService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateParcelsDto) {
    const result = await this.parcels.create(dto.track_numbers);
    if (result.count > 0) {
      void this.telegram.notifyParcelsCreated(result.inserted, result.count);
    }
    return {
      message: "parcels created successfully",
      created: result.count,
      skipped: result.skipped,
    };
  }

  @Get(":track_number")
  async getByTrackNumber(@Param("track_number") trackNumber: string) {
    return parcelResponse(await this.parcels.getByTrackNumber(trackNumber));
  }

  @Get()
  async list(@Query() dto: ListParcelsDto) {
    const result = await this.parcels.list(dto.status, dto.page, dto.limit);

    return {
      items: result.items.map(parcelResponse),
      meta: createPaginationMeta(result.page, result.limit, result.total),
    };
  }

  @Put("status")
  @HttpCode(HttpStatus.OK)
  async upsertStatus(@Body() dto: UpsertParcelsStatusDto) {
    const result = await this.parcels.upsertStatus(
      dto.track_numbers,
      dto.status,
    );
    const changed = [...result.updated, ...result.created];
    if (changed.length > 0) {
      void this.telegram.notifyParcelStatusChanged(changed, dto.status);
    }
    return {
      created: result.created.length,
      message: "parcels status updated successfully",
      skipped: result.skipped,
      updated: result.updated.length,
      unchanged: result.unchanged,
    };
  }
}

function parcelResponse(parcel: Parcel) {
  return {
    created_at: parcel.createdAt,
    id: parcel.id,
    status: parcel.status,
    track_number: parcel.trackNumber,
    updated_at: parcel.updatedAt,
  };
}
