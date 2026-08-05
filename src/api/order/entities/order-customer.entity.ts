import { ApiProperty } from '@nestjs/swagger';

/**
 * The customer (identity `User`) attached to an order in list responses.
 * This is an explicit allow-list of non-sensitive fields — `passwordHash`
 * and any other secret is never projected (see OrderService.findAll).
 */
export class OrderCustomerEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'Alice' })
  firstName: string;

  @ApiProperty({ example: 'Test' })
  lastName: string;

  @ApiProperty({ example: '690000001' })
  phone: string;

  @ApiProperty({ example: '237690000001' })
  whatsappPhone: string;

  @ApiProperty({ example: 'alice@example.com', required: false })
  email?: string;

  @ApiProperty({ example: 'FEMALE', required: false })
  gender?: string;

  @ApiProperty({ example: 'ENGLISH' })
  preferredLanguage: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  userTypeId: string;
}
