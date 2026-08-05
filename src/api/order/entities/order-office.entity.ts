import { ApiProperty } from '@nestjs/swagger';

/**
 * The office an order belongs to, in list responses. Allow-list of
 * non-sensitive fields — `signedLink` (HMAC office link) is never exposed.
 */
export class OrderOfficeEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  officeTypeId: string;

  @ApiProperty({ example: 'DD 105 BONADALE' })
  officeName: string;

  @ApiProperty({ example: 'OF-1234' })
  officeCode: string;

  @ApiProperty({ example: '105-bonadale' })
  slug: string;

  @ApiProperty({ example: 'Rue 1.234, Bonadale' })
  address: string;

  @ApiProperty({ example: 'Douala' })
  city: string;

  @ApiProperty({ example: 'Littoral' })
  region: string;

  @ApiProperty({ example: true })
  isActive: boolean;
}
