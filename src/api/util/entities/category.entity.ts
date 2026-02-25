import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponseWithPagination } from 'src/dto/swagger.dto';

class CategoryEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'Men' })
  categoryName: string;

  @ApiProperty({ example: 'Clothing and accessories for men.' })
  description: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllCategoryEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [CategoryEntity] })
  data: CategoryEntity[];
}
