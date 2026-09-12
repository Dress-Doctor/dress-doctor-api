import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

/**
 * Roles and their permissions.
 *
 * No `MongooseModule` imports: `AdminSchemaModule` and `OfficeSchemaModule`
 * are both global, so every model this needs is already available.
 */
@Module({
  controllers: [RoleController],
  providers: [RoleService, AppUtilService, CodeGeneratorService],
})
export class RoleModule {}
