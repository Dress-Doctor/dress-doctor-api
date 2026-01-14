import { ApiProperty } from '@nestjs/swagger';

export class UserTypeEntity {
  @ApiProperty()
  _id: string;

  @ApiProperty({ example: 'CUSTOMER' })
  userTypeName: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
