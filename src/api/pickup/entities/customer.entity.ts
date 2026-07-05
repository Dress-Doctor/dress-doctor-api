import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from './user.entity';

export class CustomerEntity {
  @ApiProperty()
  _id: string;

  @ApiProperty({ type: UserEntity })
  userId: UserEntity;

  @ApiProperty()
  referralCode: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
