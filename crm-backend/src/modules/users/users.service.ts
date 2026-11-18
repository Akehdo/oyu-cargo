import { Injectable } from "@nestjs/common";

import { Prisma, User, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeEmail } from "../../shared/email";
import { UserAlreadyExistsException } from "./exceptions/user-already-exists.exception";
import { UserNotFoundException } from "./exceptions/user-not-found.exception";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdmin(email: string, passwordHash: string): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          email: normalizeEmail(email),
          passwordHash,
          role: UserRole.admin,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new UserAlreadyExistsException();
      }

      throw error;
    }
  }

  async findByEmail(email: string) {
    // Literal equality also works for valid local parts containing SQL LIKE wildcards.
    const matches = await this.prisma.$queryRaw<
      Pick<User, "id" | "role" | "passwordHash" | "sessionVersion">[]
    >`SELECT id, role, password_hash AS "passwordHash", session_version AS "sessionVersion"
      FROM users WHERE lower(btrim(email)) = lower(${normalizeEmail(email)}) LIMIT 2`;
    return matches.length === 1 ? matches[0] : null;
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new UserNotFoundException();
    }

    return user;
  }
}
