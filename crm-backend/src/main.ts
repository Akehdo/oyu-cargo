import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import { getCorsOrigins } from "./config/configuration";
import { PrismaExceptionFilter } from "./shared/prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 64 * 1024 }),
  );
  const config = app.get(ConfigService);
  const corsOrigins = getCorsOrigins(config.get<string>("CORS_ALLOWED_ORIGINS"));

  // A wildcard with credentials reflects any origin; never allow it in production.
  if (corsOrigins === true && process.env.NODE_ENV === "production") {
    throw new Error("CORS_ALLOWED_ORIGINS must list explicit origins in production");
  }

  // Close Prisma/Redis cleanly on SIGTERM during deploys.
  app.enableShutdownHooks();
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.enableCors({
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    credentials: true,
    methods: ["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"],
    origin: corsOrigins,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
    }),
  );

  const port = config.get<string>("HTTP_PORT", "8080");
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
