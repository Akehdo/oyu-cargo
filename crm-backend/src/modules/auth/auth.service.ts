import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";

import { User, UserRole } from "../../prisma/generated";
import { normalizePhone } from "../../shared/phone";
import { UsersService } from "../users/users.service";
import { UserNotFoundException } from "../users/exceptions/user-not-found.exception";
import { InvalidCredentialsException } from "./exceptions/invalid-credentials.exception";
import { InvalidRefreshTokenException } from "./exceptions/invalid-refresh-token.exception";
import { RefreshTokensService } from "./refresh-tokens.service";
import { TokenService } from "./token.service";
import { TokenPair } from "./types/auth-types";

type SessionUser = Pick<User, "id" | "role" | "sessionVersion">;

// Compared against when the user does not exist, so response time does not
// reveal which emails or phones are registered.
const DUMMY_PASSWORD_HASH =
  "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.0bGv5W0nOtYaLSuMdo0y0ZqJpVdS";

@Injectable()
export class AuthService {
  constructor(
    private readonly refreshTokens: RefreshTokensService,
    private readonly tokenService: TokenService,
    private readonly users: UsersService,
  ) {}

  /** CRM login: email + password, admin role only. */
  async loginAdmin(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    return this.loginWithRole(user, password, UserRole.admin);
  }

  /** Client portal login: phone + password, user role only. */
  async loginClient(phone: string, password: string): Promise<TokenPair> {
    const normalizedPhone = normalizePhone(phone);
    const user = normalizedPhone
      ? await this.users.findByPhone(normalizedPhone)
      : null;
    return this.loginWithRole(user, password, UserRole.user);
  }

  async issueTokens(user: SessionUser): Promise<TokenPair> {
    const tokens = await this.createTokenPair(user);
    await this.refreshTokens.save(
      this.tokenService.hashRefreshToken(tokens.refresh_token),
      { userId: user.id, sessionVersion: user.sessionVersion },
      this.tokenService.refreshTtlSeconds,
    );
    return tokens;
  }

  private async createTokenPair(user: SessionUser): Promise<TokenPair> {
    return {
      access_token: await this.tokenService.generateAccessToken(
        user.id,
        user.role,
        user.sessionVersion,
      ),
      refresh_token: this.tokenService.generateRefreshToken(),
    };
  }

  async logout(refreshToken: string): Promise<boolean> {
    if (!refreshToken) {
      return false;
    }

    const deletedCount = await this.refreshTokens.delete(
      this.tokenService.hashRefreshToken(refreshToken),
    );

    return deletedCount > 0;
  }

  async refresh(oldRefreshToken: string): Promise<TokenPair> {
    if (!oldRefreshToken) {
      throw new InvalidRefreshTokenException();
    }

    const oldHash = this.tokenService.hashRefreshToken(oldRefreshToken);
    const session = await this.refreshTokens.read(oldHash);

    try {
      const user = await this.users.findById(session.userId);
      if (user.sessionVersion !== session.sessionVersion) {
        throw new InvalidRefreshTokenException();
      }
      const tokens = await this.createTokenPair(user);
      await this.refreshTokens.rotate(
        oldHash,
        session.raw,
        this.tokenService.hashRefreshToken(tokens.refresh_token),
        session,
        this.tokenService.refreshTtlSeconds,
      );
      return tokens;
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        throw new InvalidRefreshTokenException();
      }

      throw error;
    }
  }

  private async loginWithRole(
    user: User | null,
    password: string,
    role: UserRole,
  ): Promise<TokenPair> {
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || user.role !== role) {
      throw new InvalidCredentialsException();
    }

    return this.issueTokens(user);
  }
}
