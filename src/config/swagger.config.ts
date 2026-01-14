import { DocumentBuilder } from '@nestjs/swagger';
import { ApiErrorResponse } from 'src/dto/swagger.dto';

export default new DocumentBuilder()
  .setTitle('Dress Doctor API')
  .setDescription(
    'This is the API Documentation for Dress Doctor laundry service that picks up your clothes anywhere in Douala, cleans them properly, and delivers them back to you. We treat your clothes like a doctor treats patients.',
  )
  .setVersion('1.0')
  .addBearerAuth(
    {
      type: 'http',
      name: 'JWT',
      in: 'header',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter JWT token',
    },
    'access-token',
  )
  .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
  .addApiKey(
    { type: 'apiKey', name: 'x-api-secret', in: 'header' },
    'x-api-secret',
  )
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
