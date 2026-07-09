/**
 * Shared shapes for the API error envelope.
 *
 * Canonical error response (see docs/blueprint 03-api-specification.md):
 *   {
 *     "success": false,
 *     "statusCode": 400,
 *     "error": { "code": "VALIDATION_ERROR", "details": [ { "field": "amount", "message": "..." } ] },
 *     "message": "Validation failed",
 *     "timestamp": "..."
 *   }
 *
 * `error.code` is a stable SCREAMING_SNAKE_CASE machine code the frontends switch on.
 * `error.details` is populated for validation failures (one entry per failing constraint),
 * and omitted otherwise.
 */
export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorObject {
  code: string;
  details?: ErrorDetail[];
}

export interface ErrorEnvelope {
  success: false;
  statusCode: number;
  error: ErrorObject;
  message: string;
  timestamp: string;
}

/**
 * Payload shape a thrown HttpException may carry so the filter can lift a stable
 * machine `code` (and, for validation, `details`) into the envelope. All optional:
 * plain `new BadRequestException('msg')` still works — the filter derives a code
 * from the HTTP status.
 */
export interface HttpErrorPayload {
  code?: string;
  message?: string | string[];
  details?: ErrorDetail[];
  error?: string;
}
