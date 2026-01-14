import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsMongoId, IsOptional, MinDate } from 'class-validator';
import { Transform } from 'class-transformer';

export class AssignPickupDto {
  @ApiProperty({ required: true, description: 'Agent id' })
  @IsDefined({ message: 'AgentId is required' })
  @IsMongoId({ message: 'Invalid agentId' })
  agentId: string;

  @ApiProperty({ required: true, description: 'Pickup request id' })
  @IsDefined({ message: 'PickupRequestId is required' })
  @IsMongoId({ message: 'Invalid pickupRequestId' })
  pickupRequestId: string;

  @ApiProperty({
    required: false,
    example: new Date().toISOString(),
    description: 'Date pickup was assign to agent',
  })
  @IsOptional()
  @Transform(
    ({ value }): Date =>
      typeof value === 'string' ? new Date(value) : (value as Date),
  )
  @MinDate(
    () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date;
    },
    { message: 'AssignedAt date must be greater than or equal to today.' },
  )
  assignedAt?: Date;
}
