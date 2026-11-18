import { createHmac, randomBytes } from "crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { parseDurationToSeconds } from "../../config/configuration";
import { UserRole } from "../../prisma/generated";

export type AccessTokenClaims = {
  role: UserRole;
  sessionVersion: number;
  userId: string;
};

@Injectable()
export class TokenService {
  readonly refreshTtlSeconds: number;
  private readonly accessSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.accessSecret = this.config.get<string>("JWT_ACCESS_SECRET", "");
    this.refreshSecret = this.config.get<string>("JWT_REFRESH_SECRET", "");
    this.accessTtlSeconds = parseDurationToSeconds(
      this.config.get<string>("ACCESS_TTL", "15m"),
      15 * 60,
    );
    this.refreshTtlSeconds = parseDurationToSeconds(
      this.config.get<string>("REFRESH_TTL", "720h"),
      30 * 24 * 60 * 60,
    );

    if (!this.accessSecret || !this.refreshSecret) {
      throw new Error("jwt secrets must be configured");
    }
  }

  async generateAccessToken(
    userId: string,
    role: UserRole,
    sessionVersion: number,
  ): Promise<string> {
    return this.jwt.signAsync(
      { role, sv: sessionVersion },
      {
        algorithm: "HS256",
        expiresIn: this.accessTtlSeconds,
        secret: this.accessSecret,
        subject: userId,
      },
    );
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.refreshSecret).update(token).digest("hex");
  }

  async parseAccessToken(token: string): Promise<AccessTokenClaims> {
    const payload = await this.jwt.verifyAsync<{
      role?: string;
      sub?: string;
      sv?: number;
    }>(token, {
      algorithms: ["HS256"],
      secret: this.accessSecret,
    });

    if (
      !payload.sub ||
      !payload.role ||
      !isUserRole(payload.role) ||
      (payload.sv !== undefined &&
        (!Number.isSafeInteger(payload.sv) || payload.sv < 0))
    ) {
      throw new Error("invalid token payload");
    }

    // Access tokens must always point to a persisted UUID user id.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.sub,
      )
    ) {
      throw new Error("invalid token subject");
    }

    return {
      role: payload.role as UserRole,
      // Existing signed tokens predate the first password reset under this scheme.
      sessionVersion: payload.sv ?? 0,
      userId: payload.sub,
    };
  }
}

function isUserRole(value: string): value is UserRole {
  return (Object.values(UserRole) as string[]).includes(value);
}
