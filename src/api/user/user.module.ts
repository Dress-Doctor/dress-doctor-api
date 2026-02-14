import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [UserController],
  providers: [UserService, CodeGeneratorService],
})
export class UserModule {}
