import { Module } from '@nestjs/common';
import { OfficeLinkService } from './office-link.service';
import { OfficeLinkController } from './office-link.controller';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [OfficeLinkController],
  providers: [OfficeLinkService, CodeGeneratorService],
})
export class OfficeLinkModule {}
