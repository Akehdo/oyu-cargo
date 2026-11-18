import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import {
  AdminOnly,
  ClientOnly,
  CurrentUser,
} from "../auth/decorators/auth.decorator";
import { RefreshTokenDto } from "../auth/dto/refresh-token.dto";
import { AuthenticatedUser } from "../auth/guards/access-token.guard";
import { ClientAccountsService } from "./client-accounts.service";
import { ClientPortalService } from "./client-portal.service";
import { ClientsAdminService } from "./clients-admin.service";
import { ClientLoginDto, RegisterClientDto } from "./dto/client-auth.dto";
import {
  AddClientTrackDto,
  ListClientTracksDto,
  ListNotificationsDto,
  MarkNotificationsReadDto,
} from "./dto/client-portal.dto";
import { SearchClientsDto } from "./dto/search-clients.dto";

/** Public client portal auth. Tokens carry role `user`. */
@Controller("client/auth")
export class ClientAuthController {
  constructor(
    private readonly accounts: ClientAccountsService,
    private readonly auth: AuthService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterClientDto) {
    return this.accounts.register(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: ClientLoginDto) {
    return this.auth.loginClient(dto.phone, dto.password);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refresh_token);
    return { message: "logged out successfully" };
  }
}

/** Client portal: everything is scoped to the signed-in client. */
@Controller("client")
@ClientOnly()
export class ClientPortalController {
  constructor(private readonly portal: ClientPortalService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.me(user.userId);
  }

  @Get("tracks")
  listTracks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListClientTracksDto,
  ) {
    return this.portal.listTracks(
      user.userId,
      dto.archived === "true",
      dto.page,
      dto.limit,
    );
  }

  @Post("tracks")
  @HttpCode(HttpStatus.CREATED)
  addTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddClientTrackDto,
  ) {
    return this.portal.addTrack(user.userId, dto.track_number, dto.comment);
  }

  @Delete("tracks/:id")
  @HttpCode(HttpStatus.OK)
  async deleteTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    await this.portal.deleteTrack(user.userId, id);
    return { message: "track deleted" };
  }

  @Get("notifications")
  listNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListNotificationsDto,
  ) {
    return this.portal.listNotifications(user.userId, dto.limit);
  }

  @Post("notifications/read")
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.portal.markNotificationsRead(user.userId, dto.ids);
  }
}

/** CRM: client search and cards (staff only). */
@Controller("clients")
@AdminOnly()
export class ClientsController {
  constructor(
    private readonly admin: ClientsAdminService,
    private readonly accounts: ClientAccountsService,
  ) {}

  @Get()
  search(@Query() dto: SearchClientsDto) {
    return this.admin.search(dto.q, dto.page, dto.limit);
  }

  @Get("by-code/:code")
  card(@Param("code", new ParseIntPipe()) code: number) {
    return this.admin.card(code);
  }

  @Get("by-track/:track_number")
  byTrack(@Param("track_number") trackNumber: string) {
    return this.admin.byTrack(trackNumber);
  }

  @Post(":id/reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.accounts.resetPassword(id);
  }
}
