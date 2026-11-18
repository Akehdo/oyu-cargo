import { Injectable } from "@nestjs/common";

import { Prisma, User, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { UserAlreadyExistsException } from "./exceptions/user-already-exists.exception";
import { UserNotFoundException } from "./exceptions/user-not-found.exception";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdmin(email: string, passwordHash: string): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: { email, passwordHash, role: UserRole.admin },
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

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
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
