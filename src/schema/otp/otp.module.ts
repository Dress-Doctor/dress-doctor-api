import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OtpRequest, OtpRequestSchema } from './otp-request.schema';
import {
  OtpSecurityState,
  OtpSecurityStateSchema,
} from './otp-security-state.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OtpRequest.name, schema: OtpRequestSchema },
      { name: OtpSecurityState.name, schema: OtpSecurityStateSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OtpSchemaModule {}
