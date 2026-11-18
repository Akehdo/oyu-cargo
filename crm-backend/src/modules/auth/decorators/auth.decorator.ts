import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";

import { UserRole } from "../../../prisma/generated";
import {
  AccessTokenGuard,
  AuthenticatedRequest,
  AuthenticatedUser,
  ROLES_KEY,
} from "../guards/access-token.guard";

export { ROLES_KEY };

/** Require a valid access token whose role is one of `roles`. */
export function Auth(...roles: UserRole[]) {
  return applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(AccessTokenGuard),
  );
}

/** CRM endpoints: staff with role admin only. */
export const AdminOnly = () => Auth(UserRole.admin);

/** Client portal endpoints: cargo clients (role user) only. */
export const ClientOnly = () => Auth(UserRole.user);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error("CurrentUser used without the Auth guard");
    }
    return request.user;
  },
);
