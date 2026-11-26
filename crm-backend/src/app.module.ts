import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";

import { configuration } from "./config/configuration";
import { HealthController } from "./health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { ParcelsModule } from "./modules/parcels/parcels.module";
import { RecordsModule } from "./modules/records/records.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { TelegramModule } from "./telegram/telegram.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { ClientTelegramModule } from "./modules/client-telegram/client-telegram.module";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TelegramModule,
    RedisModule,
    AuthModule,
    ParcelsModule,
    RecordsModule,
    ExpensesModule,
    TransactionsModule,
    ReportsModule,
    ClientsModule,
    ClientTelegramModule,
  ],
})
export class AppModule {}
