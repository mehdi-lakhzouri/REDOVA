import { HttpException } from '@nestjs/common';
import { ERROR_HTTP_STATUS, ERROR_MESSAGES, type ErrorCode } from '@redova/contracts';

/** Domain error carrying a REDOVA error code; rendered by ApiExceptionFilter in the envelope. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string = ERROR_MESSAGES[code],
  ) {
    super(message, ERROR_HTTP_STATUS[code]);
  }
}
