import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiClientService } from './api-client.service';
import { CreateApiClientDto } from './dto/create-api-client.dto';
import { ApiBody, ApiOperation } from '@nestjs/swagger';

@Controller('api-client')
export class ApiClientController {
  private readonly logger = new Logger(ApiClientController.name);

  constructor(private readonly apiClientService: ApiClientService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreateApiClientDto })
  @ApiOperation({ summary: 'Used to create an api-client' })
  async create(@Body() data: CreateApiClientDto) {
    this.logger.log(
      `is creating a new api-client with ${JSON.stringify(data)}`,
    );
    return await this.apiClientService.create(data);
  }
}
