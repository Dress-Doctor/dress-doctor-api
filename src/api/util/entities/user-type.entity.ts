import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class UserTypeEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'CUSTOMER' })
  userTypeName: string;

  @ApiProperty({
    example: 'End user who places laundry pickup and delivery orders.',
  })
  description: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllUserTypeEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [UserTypeEntity] })
  data: UserTypeEntity[];
}
