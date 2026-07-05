import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class SubCategoryEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'Top' })
  subCategoryName: string;

  @ApiProperty({
    required: false,
    example: 'Clothing items worn on the upper body.',
  })
  description?: string;

  @ApiProperty({ default: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllSubCategoryEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [SubCategoryEntity] })
  data: SubCategoryEntity[];
}
