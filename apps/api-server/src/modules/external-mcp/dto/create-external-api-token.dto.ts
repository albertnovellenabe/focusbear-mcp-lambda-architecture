import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { McpScope } from '../domain/mcp-scopes.enum';

export class CreateExternalApiTokenDto {
  @ApiProperty({
    description: 'Scopes granted to this token',
    enum: McpScope,
    isArray: true,
    example: ['tasks:read', 'tasks:write'],
  })
  @IsArray()
  @IsEnum(McpScope, { each: true })
  scopes: McpScope[];

  @ApiProperty({
    description: 'Human-readable label for this token (e.g. "My MCP Client")',
    required: false,
    example: 'My MCP Client',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    description: 'Name of the AI agent this token belongs to (e.g. "Captain Codebeard")',
    required: false,
    example: 'Captain Codebeard',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agent_name?: string;
}
