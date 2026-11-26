import { randomInt } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";

import { ClientCodeSource, Prisma, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeEmail } from "../../shared/email";
import { normalizePhone } from "../../shared/phone";
import { AuthService } from "../auth/auth.service";
import { TokenPair } from "../auth/types/auth-types";
import { CLIENT_CODE_MAX, CLIENT_CODE_MIN } from "./client-code";
import { RegisterClientDto } from "./dto/client-auth.dto";
import { linkPastIssuances } from "./issuance-tracks";

/** Bump when the cargo terms text in crm-client/src/config/content.ts changes. */
export const CLIENT_TERMS_VERSION = "2026-11-18";

const CODE_ATTEMPTS = 30;
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

@Injectable()
export class ClientAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
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
      throw new BadRequestException(
        "Введите действительный мобильный номер Казахстана.",
      );
    }
    const email = normalizeEmail(dto.email);
    await this.ensureContactsAreFree(email, phone);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const existingCode = dto.existing_code;
    if (existingCode !== undefined) {
      await this.ensureCodeIsFree(existingCode);
    }

    // Retry when two registrations race for the same random code.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = existingCode ?? (await this.pickFreeCode());

      try {
        const user = await this.prisma.$transaction(
          async (tx) => {
            const created = await tx.user.create({
              data: {
                clientProfile: {
                  create: {
                    code,
                    codeSource:
                      existingCode === undefined
                        ? ClientCodeSource.generated
                        : ClientCodeSource.existing,
                    name: dto.name,
                    termsAcceptedAt: new Date(),
                    termsVersion: CLIENT_TERMS_VERSION,
                  },
                },
                email,
                passwordHash,
                phone,
                role: UserRole.user,
              },
            });
            if (existingCode !== undefined) {
              await linkPastIssuances(tx, created.id, existingCode);
            }
            return created;
          },
          { maxWait: 10_000, timeout: 30_000 },
        );

        return { ...(await this.auth.issueTokens(user)), client_code: code };
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        // A concurrent signup may have taken a contact after our availability check.
        // Only a random profile-code collision should proceed to the next attempt.
        await this.ensureContactsAreFree(email, phone);
        if (existingCode !== undefined) {
          await this.ensureCodeIsFree(existingCode);
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

  private async ensureContactsAreFree(
    email: string,
    phone: string,
  ): Promise<void> {
    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE phone = ${phone} OR lower(btrim(email)) = lower(${email}) LIMIT 1`;
    const seedEmail = this.config.get<string>("SEED_ADMIN_EMAIL");
    if (existing.length || (seedEmail && normalizeEmail(seedEmail) === email)) {
      const message = "Телефон или электронная почта уже используются.";
      throw new ConflictException({
        statusCode: 409,
        error: { code: "CONTACT_ALREADY_REGISTERED", message },
        message,
      });
    }
  }

  /** A code typed by an existing client must not belong to another account. */
  private async ensureCodeIsFree(code: number): Promise<void> {
    const taken = await this.prisma.clientProfile.findUnique({
      select: { userId: true },
      where: { code },
    });
    if (taken) {
      const message =
        "Этот личный код уже привязан к другому аккаунту. Напишите нам в WhatsApp.";
      throw new ConflictException({
        statusCode: 409,
        error: { code: "CLIENT_CODE_TAKEN", message },
        message,
      });
    }
  }

  /** Random 5-digit code not used by another client or by past CRM issuances. */
  private async pickFreeCode(): Promise<number> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = randomInt(CLIENT_CODE_MIN, CLIENT_CODE_MAX + 1);
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
