import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UserRole } from "../../../prisma/generated";
import { PrismaService } from "../../../prisma/prisma.service";
import { AccessTokenClaims, TokenService } from "../token.service";

export type AuthenticatedUser = {
  role: UserRole;
  userId: string;
};

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};

export const ROLES_KEY = "auth:roles";

/**
 * Validates the bearer token and the roles declared with @Auth/@AdminOnly/@ClientOnly.
 * Deny by default: a route without declared roles is rejected.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headerValue = request.headers.authorization;
    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!header) {
      throw new UnauthorizedException("authorization header is required");
    }

    const [scheme, token] = header.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException(
        "authorization header must be in format: Bearer <token>",
      );
    }

    let user: AccessTokenClaims;
    try {
      user = await this.tokenService.parseAccessToken(token);
    } catch {
      throw new UnauthorizedException("invalid or expired access token");
    }

    const current = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { sessionVersion: true, role: true },
    });
    if (
      !current ||
      current.sessionVersion !== user.sessionVersion ||
      current.role !== user.role
    ) {
      throw new UnauthorizedException("session has expired");
    }

    const roles =
      this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!roles.includes(user.role)) {
      throw new ForbiddenException("access denied for this role");
    }

    request.user = { role: user.role, userId: user.userId };
    return true;
  }
}
