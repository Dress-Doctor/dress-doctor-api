import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindPickupDto } from './find-pickup.dto';

export enum PickupExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (keyword, date window, status, customer, office)
// so the export matches exactly what the list endpoint would return —
// page/size are ignored: an export always spans the full filtered set.
export class ExportPickupDto extends FindPickupDto {
  @ApiProperty({
    enum: PickupExportFormatEnum,
    description: 'Output format for the download',
    example: PickupExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(PickupExportFormatEnum, { message: 'format must be csv or excel' })
  format: PickupExportFormatEnum;
}
