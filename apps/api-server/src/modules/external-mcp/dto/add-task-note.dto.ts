import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddTaskNoteDto {
  @ApiProperty({
    description: 'Note content to add to the task',
    example: 'Working on this now — will complete by EOD.',
    maxLength: 10000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;
}
