import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ProjectStatus } from '../../project/domain/project-status.model';

export class EnsureProjectStatusDto {
  @ApiProperty({
    description: 'UUID of the project to add the status to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  project_id: string;

  @ApiProperty({
    description: 'Display label for the status (case-insensitive deduplication)',
    example: 'Ready for human review',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiProperty({
    description: 'Hex color code for the status badge',
    example: '#F59E0B',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color code (e.g. #F59E0B)' })
  color: string;

  @ApiProperty({
    description: 'Whether tasks assigned this status should be marked as completed',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  should_complete_task?: boolean;
}

export class EnsureProjectStatusResponseDto implements ProjectStatus {
  @ApiProperty({ description: 'Status ID (UUID for new statuses; original id for existing ones)' })
  id: string;

  @ApiProperty({ description: 'Display label' })
  label: string;

  @ApiProperty({ description: 'Hex color code' })
  color: string;

  @ApiProperty({ description: 'Sort order within the project' })
  order: number;

  @ApiProperty({ description: 'Whether tasks assigned this status are considered completed' })
  should_complete_task: boolean;

  @ApiProperty({ description: 'Whether this status already existed (true) or was just created (false)' })
  already_existed: boolean;
}
