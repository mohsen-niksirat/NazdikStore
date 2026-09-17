import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { buildErrorEnvelope, ERROR_CODES } from '@nazdik/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string; method?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_ERROR;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        code = this.mapStatusToCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (typeof body.code === 'string') {
          code = body.code;
          details = body.details ?? body.message;
        } else if (Array.isArray(body.message)) {
          code = ERROR_CODES.VALIDATION_FAILED;
          details = body.message;
        } else if (typeof body.message === 'string') {
          code = this.mapStatusToCode(status);
          details = body.message;
        } else {
          code = this.mapStatusToCode(status);
        }
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope = buildErrorEnvelope(code, details);
    response.status(status).json(envelope);
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case 400:
        return ERROR_CODES.VALIDATION_FAILED;
      case 401:
        return ERROR_CODES.UNAUTHORIZED;
      case 403:
        return ERROR_CODES.FORBIDDEN;
      case 404:
        return ERROR_CODES.NOT_FOUND;
      case 409:
        return ERROR_CODES.CONFLICT;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
