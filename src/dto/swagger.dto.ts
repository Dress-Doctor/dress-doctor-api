import { ApiProperty } from '@nestjs/swagger';

export class Base {
  @ApiProperty({
    required: true,
    example: 'false',
    description: 'Describe is the request was successful or not',
  })
  success: boolean;

  @ApiProperty({
    example: 400,
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

export class ApiErrorResponse extends Base {
  @ApiProperty({
    required: true,
    example: 'Bad Request',
    description: 'A message describing the error',
  })
  error: string;

  @ApiProperty({
    required: true,
    example: 'serverError',
    description: 'Unique identifier for the error message',
  })
  errorCode: string;
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
