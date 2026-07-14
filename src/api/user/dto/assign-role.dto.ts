import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsMongoId, IsOptional } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ required: true, description: 'Role id to assign' })
  @IsDefined({ message: 'roleId is required' })
  @IsMongoId({ message: 'Invalid roleId' })
  roleId: string;

  @ApiProperty({
    required: false,
    description:
      'Office id — set for a per-office (OfficeUser) assignment; omit for a global (UserRole) assignment',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;
}
