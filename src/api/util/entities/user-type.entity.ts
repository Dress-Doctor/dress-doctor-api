import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

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

export class FindAllUserTypeEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [UserTypeEntity] })
  data: UserTypeEntity[];
}
