import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { FindAllUserDto } from './find-all-user.dto';

export enum UserExportFormatEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

// Inherits every list filter (q, userType, created-at window, status) so the
// export matches exactly what the list endpoint would return — page/size are
// ignored: an export always spans the full filtered set.
export class ExportUserDto extends FindAllUserDto {
  @ApiProperty({
    enum: UserExportFormatEnum,
    description: 'Output format for the download',
    example: UserExportFormatEnum.CSV,
  })
  @IsDefined({ message: 'format is required' })
  @IsEnum(UserExportFormatEnum, { message: 'format must be csv or excel' })
  format: UserExportFormatEnum;
}
