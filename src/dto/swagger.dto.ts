import { ApiHeaderOptions, ApiProperty } from '@nestjs/swagger';

export const xApiKey: ApiHeaderOptions = {
  required: true,
  name: 'x-api-key',
  schema: { default: '{{apiKey}}' },
};

export const xApiSecret: ApiHeaderOptions = {
  required: true,
  name: 'x-api-secret',
  schema: { default: '{{apiSecret}}' },
};

/**
 * Why this change is being made. Required on every mutating request
 * (POST/PATCH/PUT/DELETE) and written to the audit trail, so no history entry
 * can say what changed without saying why. 3–500 characters.
 */
export const xChangeReason: ApiHeaderOptions = {
  required: true,
  name: 'x-change-reason',
  description:
    'Why this change is being made (3–500 chars). Recorded on the audit ' +
    'trail entry for every record the request touches.',
  schema: { example: 'washing had not actually started' },
};

export class Base {
  @ApiProperty({
    required: true,
    example: true,
    description: 'Describe is the request was successful or not',
  })
  success: boolean;

  @ApiProperty({
    example: 200,
    required: true,
    description: 'The HTTP status code',
  })
  statusCode: number;

  @ApiProperty({
    required: true,
    example: '2026-01-04T13:09:58.201Z',
    description: 'Server response time',
  })
  timestamp: Date;
}

class ApiErrorDetail {
  @ApiProperty({
    example: 'amount',
    description: 'The request field the message applies to (dotted path)',
  })
  field: string;

  @ApiProperty({
    example: 'must be a positive integer',
    description: 'Human-readable message for this field',
  })
  message: string;
}

class ApiErrorObject {
  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description: 'Stable machine error code (SCREAMING_SNAKE_CASE)',
  })
  code: string;

  @ApiProperty({
    required: false,
    type: [ApiErrorDetail],
    description:
      'Per-field validation messages; present only for validation errors',
  })
  details?: ApiErrorDetail[];
}

export class ApiErrorResponse extends Base {
  @ApiProperty({
    required: true,
    example: false,
    description: 'Describe is the request was successful or not',
  })
  declare success: boolean;

  @ApiProperty({
    example: 400,
    required: true,
    description: 'The HTTP status code',
  })
  declare statusCode: number;

  @ApiProperty({
    required: true,
    type: ApiErrorObject,
    description:
      'Error detail: a machine code and, for validation, per-field messages',
  })
  error: ApiErrorObject;

  @ApiProperty({
    required: true,
    example: 'Validation failed',
    description: 'A human-readable message describing the error',
  })
  message: string;
}

export class ApiSuccessResponse extends Base {
  @ApiProperty({
    required: true,
    example: 'Success',
    description: 'A message describing the response',
  })
  message: string;
}

export class ApiSuccessResponseWithPagination extends ApiSuccessResponse {
  @ApiProperty({
    example: 1,
    required: true,
    description: 'The data returned by the request',
  })
  nextPage: number;

  @ApiProperty({
    example: 10,
    required: true,
    description: 'The data returned by the request',
  })
  total: number;
}
