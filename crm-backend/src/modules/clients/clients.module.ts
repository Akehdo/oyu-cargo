import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ClientAccountsService } from "./client-accounts.service";
import { ClientEventsService } from "./client-events.service";
import { ClientPortalService } from "./client-portal.service";
import { ClientsAdminService } from "./clients-admin.service";
import {
  ClientAuthController,
  ClientPortalController,
  ClientsController,
} from "./clients.controllers";

/**
 * Clients: cargo customers (users with role `user`).
 * - /client/*  — client portal API (client tokens)
 * - /clients/* — CRM lookups (admin tokens)
 * ClientEventsService is exported so CRM parcel/issuance flows can notify clients.
 */
@Module({
  controllers: [ClientAuthController, ClientPortalController, ClientsController],
  exports: [ClientEventsService],
  imports: [AuthModule],
  providers: [
    ClientAccountsService,
    ClientEventsService,
    ClientPortalService,
    ClientsAdminService,
  ],
})
export class ClientsModule {}
