import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { SkipApiKeyCheck } from 'src/helper/decorator/skip-api-key.decorator';
import { ApiClientService } from './api-client.service';
import { CreateApiClientDto } from './dto/create-api-client.dto';

@Controller('api-client')
export class ApiClientController {
  private readonly logger = new Logger(ApiClientController.name);

  constructor(private readonly apiClientService: ApiClientService) {}
  // TODO: Add @ApiResponse
  @Post()
  @SkipApiKeyCheck()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Used to create an api-client' })
  async create(@Body() data: CreateApiClientDto) {
    this.logger.log(
      `is creating a new api-client with ${JSON.stringify(data)}`,
    );
    return await this.apiClientService.create(data);
  }
}
