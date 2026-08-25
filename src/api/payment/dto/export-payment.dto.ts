import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindPaymentDto } from './find-payment.dto';

export enum PaymentExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (free-text, date window, method, type, office)
// so the export matches exactly what the list endpoint would return —
// page/size are ignored: an export always spans the full filtered set.
export class ExportPaymentDto extends FindPaymentDto {
  @ApiProperty({
    enum: PaymentExportFormatEnum,
    description: 'Output format for the download',
    example: PaymentExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(PaymentExportFormatEnum, { message: 'format must be csv or excel' })
  format: PaymentExportFormatEnum;
}
