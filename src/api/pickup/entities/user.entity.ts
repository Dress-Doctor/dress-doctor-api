import { ApiProperty } from '@nestjs/swagger';
import { UserTypeEntity } from './user-type.entity';

export class UserEntity {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  whatsappPhone: string;

  @ApiProperty()
  preferredLanguage: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: UserTypeEntity })
  userTypeId: UserTypeEntity;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
