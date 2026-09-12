import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

/**
 * The catalogue screen's own module.
 *
 * Split out of `UtilModule` rather than added to it: the six catalogue
 * collections now carry five endpoints each, and folding thirty more routes
 * into the reference controller would have doubled a file nobody could read.
 * The URLs are unchanged — both controllers are mounted under `/reference`,
 * and their paths do not overlap.
 *
 * No `MongooseModule` imports: `CatalogSchemaModule` is global, so every
 * model this needs is already available.
 */
@Module({
  controllers: [CatalogueController],
  providers: [CatalogueService, AppUtilService, CodeGeneratorService],
})
export class CatalogueModule {}
