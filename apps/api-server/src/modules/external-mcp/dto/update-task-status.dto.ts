import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToDoStatus } from '../../to-do/domain/to-do-status.enum';

export class UpdateTaskStatusDto {
  @ApiProperty({
    description: 'New core status for the task (use for standard state transitions)',
    enum: ToDoStatus,
    example: ToDoStatus.IN_PROGRESS,
    required: false,
  })
  @IsOptional()
  @IsEnum(ToDoStatus)
  status?: ToDoStatus;

  @ApiProperty({
    description:
      'Custom project status ID (use to set project-level statuses such as "Ready for human review"). ' +
      'Must be a valid status ID from the task\'s project.',
    example: 'ready-for-human-review',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  custom_status_id?: string;
}
