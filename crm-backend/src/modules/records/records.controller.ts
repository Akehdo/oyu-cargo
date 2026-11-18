import {
  Body,
  Controller,
  Delete,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { AdminOnly } from "../auth/decorators/auth.decorator";
import {
  Record as RecordModel,
  Transaction,
  TransactionType,
} from "../../prisma/generated";
import { createPaginationMeta } from "../../shared/pagination";
import { toMoneyNumber } from "../../shared/money";
import { trackNumbersFromJson } from "../../shared/track-numbers";
import { TelegramService } from "../../telegram/telegram.service";
import { CreateRecordDto } from "./dto/create-record.dto";
import { ListRecordTrackNumbersDto } from "./dto/list-record-track-numbers.dto";
import { ListRecordsDto } from "./dto/list-records.dto";
import { UpdateRecordDto } from "./dto/update-record.dto";
import { RecordsService } from "./records.service";

@Controller("records")
@AdminOnly()
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly telegram: TelegramService,
  ) {}

  @Get("track-numbers")
  async listTrackNumbers(@Query() dto: ListRecordTrackNumbersDto) {
    return {
      date: dto.date,
      track_numbers: await this.records.listTrackNumbersByDate(dto.date),
    };
  }

  @Get("by-track/:track_number")
  async getByTrackNumber(@Param("track_number") trackNumber: string) {
    return recordResponse(await this.records.getByTrackNumber(trackNumber));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRecordDto) {
    const record = await this.records.create(dto);
    void this.telegram.notifyRecordCreated(record);
    return recordResponse(record);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecordDto,
  ) {
    const record = await this.records.update(id, dto);
    if (record.changedFields.length > 0) {
      void this.telegram.notifyRecordUpdated(record, record.changedFields);
    }
    return recordResponse(record);
  }

  @Get()
  async list(@Query() dto: ListRecordsDto) {
    const result = await this.records.list(
      dto.payment_type,
      dto.page,
      dto.limit,
    );

    return {
      items: result.items.map(recordResponse),
      meta: createPaginationMeta(result.page, result.limit, result.total),
    };
  }

  @Get(":id")
  async get(@Param("id", new ParseUUIDPipe()) id: string) {
    return recordResponse(await this.records.get(id));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(
      "confirm_track_reassignment",
      new DefaultValuePipe(false),
      ParseBoolPipe,
    )
    confirmReassignment = false,
  ) {
    const record = await this.records.delete(id, confirmReassignment);
    void this.telegram.notifyRecordDeleted(record);
    return recordResponse(record);
  }
}

type RecordResponseModel = RecordModel & {
  transactions?: Transaction[];
};

function recordResponse(record: RecordResponseModel) {
  return {
    id: record.id,
    client_code: Number(record.clientCode),
    track_numbers: trackNumbersFromJson(record.trackNumbers),
    weight: record.weight,
    price: toMoneyNumber(record.price),
    package_type: record.packageType,
    payment_type: record.paymentType,
    payments: paymentsResponse(record),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function paymentsResponse(record: RecordResponseModel) {
  const payments = record.transactions
    ?.filter(
      (transaction) => transaction.transactionType === TransactionType.INCOME,
    )
    .map((transaction) => ({
      amount: toMoneyNumber(transaction.amount),
      payment_type: transaction.paymentType,
    }));

  return payments ?? [];
}
