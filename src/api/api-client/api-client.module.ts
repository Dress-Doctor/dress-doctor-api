import { Module } from '@nestjs/common';
import { ApiClientService } from './api-client.service';
import { ApiClientController } from './api-client.controller';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [ApiClientController],
  providers: [ApiClientService, CodeGeneratorService],
})
export class ApiClientModule {}
