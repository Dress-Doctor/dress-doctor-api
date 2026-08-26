import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindCustomerDto } from './find-customer.dto';

export enum CustomerExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (keyword, office, registration window, status,
// language, inactivity) so the export matches exactly what the list endpoint
// would return — page/size are ignored: an export always spans the full
// filtered set.
export class ExportCustomerDto extends FindCustomerDto {
  @ApiProperty({
    enum: CustomerExportFormatEnum,
    description: 'Output format for the download',
    example: CustomerExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(CustomerExportFormatEnum, { message: 'format must be csv or excel' })
  format: CustomerExportFormatEnum;
}
