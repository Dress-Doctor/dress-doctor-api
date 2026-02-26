import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class ServiceEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'Wash and Fold' })
  serviceName: string;

  @ApiProperty({ required: false, example: 'Basic laundry service' })
  description?: string;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllServiceEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [ServiceEntity] })
  data: ServiceEntity[];
}
