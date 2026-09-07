import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { CatalogueHistoryEntryEntity } from './catalogue.entity';

export class ServiceEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'SV-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single service ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

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

export class FindAllServiceEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [ServiceEntity] })
  data: ServiceEntity[];
}

export class ServiceDetailDataEntity extends ServiceEntity {
  @ApiProperty({
    example: 8,
    description: 'How many items are priced under this service.',
  })
  itemCount: number;

  @ApiProperty({
    type: [CatalogueHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: CatalogueHistoryEntryEntity[];
}

export class ServiceDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: ServiceDetailDataEntity })
  data: ServiceDetailDataEntity;
}
