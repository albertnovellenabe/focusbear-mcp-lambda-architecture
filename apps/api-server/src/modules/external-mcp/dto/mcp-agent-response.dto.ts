import { ApiProperty } from '@nestjs/swagger';

export class McpAgentResponseDto {
  @ApiProperty({ description: 'Token ID — use this as assigned_mcp_token_id when assigning tasks to this agent' })
  id: string;

  @ApiProperty({ description: 'Agent name', required: false })
  agent_name?: string;

  @ApiProperty({ description: 'Human-readable label for this token', required: false })
  label?: string;

  @ApiProperty({ description: 'Scopes granted to this token', type: [String] })
  scopes: string[];

  @ApiProperty({ description: 'When the token was created' })
  created_at: string;
}
