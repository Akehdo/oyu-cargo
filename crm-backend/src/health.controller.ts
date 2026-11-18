import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "./prisma/prisma.service";
import { RedisService } from "./redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  check() {
    return { status: "ok" };
  }

  /** Readiness: PostgreSQL and Redis answer. Used by the Docker healthcheck. */
  @Get("ready")
  async ready() {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.getClient().ping(),
    ]);

    const result = {
      database: database.status === "fulfilled" ? "ok" : "down",
      redis: redis.status === "fulfilled" ? "ok" : "down",
    };
    if (result.database !== "ok" || result.redis !== "ok") {
      throw new ServiceUnavailableException({ status: "down", ...result });
    }

    return { status: "ok", ...result };
  }
}
