import { DocumentBuilder } from '@nestjs/swagger';
import { ApiErrorResponse, ApiSuccessResponse } from 'src/dto/swagger.dto';

export default new DocumentBuilder()
  .setTitle('Dress Doctor API')
  .setDescription(
    'This is the API Documentation for Dress Doctor laundry service that picks up your clothes anywhere in Douala, cleans them properly, and delivers them back to you. We treat your clothes like a doctor treats patients.',
  )
  .setVersion('1.0')
  .addBearerAuth()
  .addApiKey({ type: 'apiKey', name: 'api-key', in: 'header' }, 'Api-Key')
  .addApiKey(
    { type: 'apiKey', name: 'api-secrete', in: 'header' },
    'Api-Secrete',
  )
  .addGlobalResponse({
    status: 201,
    type: ApiSuccessResponse,
    description: 'Successful operation',
  })
  .addGlobalResponse({
    status: 400,
    type: ApiErrorResponse,
    description: 'Bad Request',
  })
  .addGlobalResponse({
    status: 401,
    type: ApiErrorResponse,
    description: 'Unauthorized',
  })
  .addGlobalResponse({
    status: 500,
    type: ApiErrorResponse,
    description: 'Internal Server Error',
  })
  .build();
