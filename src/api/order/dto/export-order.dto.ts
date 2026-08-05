import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindOrderDto } from './find-order.dto';

export enum OrderExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (keyword, date range, status, customer, office
// scope) so the export matches exactly what the list endpoint would return —
// page/size are ignored: an export always spans the full filtered set.
export class ExportOrderDto extends FindOrderDto {
  @ApiProperty({
    enum: OrderExportFormatEnum,
    description: 'Output format for the download',
    example: OrderExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(OrderExportFormatEnum, { message: 'format must be csv or excel' })
  format: OrderExportFormatEnum;
}
