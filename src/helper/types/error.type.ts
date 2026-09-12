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
  /**
   * The one request field a business rule is about, when it is about one —
   * `DRAFT_EXISTS` naming `customerId`, say. A validation failure uses
   * `details[]` instead, which carries a message per field.
   */
  field?: string;
  /**
   * What the caller could have asked for instead, when a rule refuses the
   * value they sent. `INVALID_STATUS_TRANSITION` lists the statuses the order
   * could actually move to, so a client does not need its own copy of the
   * workflow to recover.
   */
  allowed?: string[];
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
  field?: string;
  allowed?: string[];
  error?: string;
}
