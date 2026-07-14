import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsMongoId } from 'class-validator';

export class AssignOfficeUserDto {
  @ApiProperty({ required: true, description: 'User to assign to this office' })
  @IsDefined({ message: 'userId is required' })
  @IsMongoId({ message: 'Invalid userId' })
  userId: string;

  @ApiProperty({ required: true, description: 'Role held at this office' })
  @IsDefined({ message: 'roleId is required' })
  @IsMongoId({ message: 'Invalid roleId' })
  roleId: string;
}
