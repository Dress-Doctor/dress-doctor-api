import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class FollowUpParamsDto {
  @ApiProperty({
    description: 'Follow-up id',
    example: '64b8c9f1e4b0a2d3c4f5a6b7',
  })
  @IsMongoId({ message: 'Invalid follow-up id' })
  id: string;
}
