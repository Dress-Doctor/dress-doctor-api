import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindOfficeDto } from './find-office.dto';

export enum OfficeExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (q, officeTypeName, created-at window, status) so
// the export matches exactly what the list endpoint would return — page/size
// are ignored: an export always spans the full filtered set.
export class ExportOfficeDto extends FindOfficeDto {
  @ApiProperty({
    enum: OfficeExportFormatEnum,
    description: 'Output format for the download',
    example: OfficeExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(OfficeExportFormatEnum, { message: 'format must be csv or excel' })
  format: OfficeExportFormatEnum;
}
