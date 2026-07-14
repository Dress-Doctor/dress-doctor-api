import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveFollowUpDto {
  @ApiProperty({
    required: false,
    description: 'Optional note on how the follow-up was handled',
    example: 'Called — will drop clothes Saturday',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
