import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";

import { Prisma } from "../prisma/generated";

type ReplyLike = {
  status: (code: number) => { send: (body: unknown) => void };
};

const STATUS_BY_CODE: Record<string, { status: number; message: string }> = {
  // Value too long for the column.
  P2000: { message: "value is too long", status: HttpStatus.BAD_REQUEST },
  // Unique constraint.
  P2002: { message: "record already exists", status: HttpStatus.CONFLICT },
  // Foreign key constraint.
  P2003: { message: "related record not found", status: HttpStatus.BAD_REQUEST },
  // Numeric value out of range.
  P2020: { message: "value is out of range", status: HttpStatus.BAD_REQUEST },
  // Record to update/delete not found.
  P2025: { message: "record not found", status: HttpStatus.NOT_FOUND },
  // Interactive transaction timed out / could not start.
  P2028: {
    message: "the server is busy, please retry",
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  // Serialization failure or deadlock.
  P2034: {
    message: "conflicting update, please retry",
    status: HttpStatus.CONFLICT,
  },
};

/**
 * Turns known Prisma errors that services do not handle into 4xx/503 answers
 * instead of a generic 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    const mapped = STATUS_BY_CODE[error.code];

    if (!mapped) {
      this.logger.error(`Unhandled Prisma error ${error.code}`, error.stack);
      reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: "Internal server error",
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
      return;
    }

    reply.status(mapped.status).send({
      message: mapped.message,
      statusCode: mapped.status,
    });
  }
}
