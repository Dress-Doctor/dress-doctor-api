import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { AppUtilService } from 'src/helper/service/app-util.service';

@Module({
  controllers: [UserController],
  providers: [UserService, CodeGeneratorService, AppUtilService],
})
export class UserModule {}
