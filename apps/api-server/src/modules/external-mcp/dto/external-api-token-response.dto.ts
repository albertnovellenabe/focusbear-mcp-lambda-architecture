import { ApiProperty } from '@nestjs/swagger';

export class ExternalApiTokenResponseDto {
  @ApiProperty({ description: 'Token UUID' })
  id: string;

  @ApiProperty({ description: 'Human-readable label', required: false })
  label?: string;

  @ApiProperty({ description: 'Name of the AI agent this token belongs to', required: false })
  agent_name?: string;

  @ApiProperty({ description: 'Scopes granted to this token', type: [String] })
  scopes: string[];

  @ApiProperty({ description: 'When the token was last used', required: false })
  last_used_at?: Date;

  @ApiProperty({ description: 'When the token expires (null = never)', required: false })
  expires_at?: Date;

  @ApiProperty({ description: 'When the token was created' })
  created_at: string;
}

export class ExternalApiTokenIssuedResponseDto extends ExternalApiTokenResponseDto {
  @ApiProperty({
    description: 'The raw token — shown ONCE at issuance, never retrievable again. Store it securely.',
  })
  token: string;
}
