import { randomInt } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";

import { Prisma, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizePhone } from "../../shared/phone";
import { AuthService } from "../auth/auth.service";
import { TokenPair } from "../auth/types/auth-types";
import { RegisterClientDto } from "./dto/client-auth.dto";

/** Bump when the cargo terms text in crm-client/src/config/content.ts changes. */
export const CLIENT_TERMS_VERSION = "2026-11-18";

const CODE_MIN = 10_000;
const CODE_MAX = 99_999;
const CODE_ATTEMPTS = 30;
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

@Injectable()
export class ClientAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async register(
    dto: RegisterClientDto,
  ): Promise<TokenPair & { client_code: number }> {
    if (dto.terms_version !== CLIENT_TERMS_VERSION) {
      const message =
        "Обновите страницу и подтвердите актуальную редакцию условий.";
      throw new ConflictException({
        statusCode: 409,
        error: { code: "TERMS_VERSION_MISMATCH", message },
        message,
      });
    }
    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException("invalid phone number");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Retry when two registrations race for the same random code.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.ensurePhoneIsFree(phone);
      const code = await this.pickFreeCode();

      try {
        const user = await this.prisma.user.create({
          data: {
            clientProfile: {
              create: {
                code,
                name: dto.name,
                termsAcceptedAt: new Date(),
                termsVersion: dto.terms_version,
              },
            },
            passwordHash,
            phone,
            role: UserRole.user,
          },
        });

        return { ...(await this.auth.issueTokens(user)), client_code: code };
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
      }
    }

    throw new ConflictException("could not register, please retry");
  }

  /** Staff action: set a new temporary password and return it once. */
  async resetPassword(userId: string): Promise<{ password: string }> {
    const user = await this.prisma.user.findUnique({
      select: { id: true, role: true },
      where: { id: userId },
    });
    if (!user || user.role !== UserRole.user) {
      throw new NotFoundException("client not found");
    }

    const password = Array.from(
      { length: 8 },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
    ).join("");

    await this.prisma.user.update({
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        sessionVersion: { increment: 1 },
      },
      where: { id: userId },
    });
    return { password };
  }

  private async ensurePhoneIsFree(phone: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      select: { id: true },
      where: { phone },
    });
    if (existing) {
      throw new ConflictException("phone is already registered");
    }
  }

  /** Random 5-digit code not used by another client or by past CRM issuances. */
  private async pickFreeCode(): Promise<number> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = randomInt(CODE_MIN, CODE_MAX + 1);
      const [profile, record] = await Promise.all([
        this.prisma.clientProfile.findUnique({
          select: { userId: true },
          where: { code },
        }),
        this.prisma.record.findFirst({
          select: { id: true },
          where: { clientCode: BigInt(code) },
        }),
      ]);

      if (!profile && !record) {
        return code;
      }
    }

    throw new ConflictException("no free client codes left");
  }
}
