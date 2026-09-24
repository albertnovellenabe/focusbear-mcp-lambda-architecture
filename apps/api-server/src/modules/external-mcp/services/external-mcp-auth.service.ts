import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ScryptService } from '@app/crypto';
import { ExternalApiTokenRepository } from '../repositories/external-api-token.repository';
import { ExternalApiToken } from '../entities/external-api-token.entity';
import { CreateExternalApiTokenDto } from '../dto/create-external-api-token.dto';
import { ExternalApiTokenIssuedResponseDto, ExternalApiTokenResponseDto } from '../dto/external-api-token-response.dto';
import { McpAgentResponseDto } from '../dto/mcp-agent-response.dto';

@Injectable()
export class ExternalMcpAuthService {
  constructor(
    private readonly externalApiTokenRepository: ExternalApiTokenRepository,
    private readonly scryptService: ScryptService,
  ) {}

  async issueToken(userId: string, dto: CreateExternalApiTokenDto): Promise<ExternalApiTokenIssuedResponseDto> {
    // Generate a cryptographically random 64-char hex token
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Use SHA-256 hash of the token (not the raw prefix) to avoid leaking actual token bytes
    const tokenPrefix = crypto.createHash('sha256').update(rawToken).digest('hex').substring(0, 16);
    const tokenHash = await this.scryptService.hash(rawToken);

    const entity = new ExternalApiToken(
      {
        user_id: userId,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        scopes: dto.scopes,
        label: dto.label,
        agent_name: dto.agent_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { generateId: true },
    );

    const saved = await this.externalApiTokenRepository.create(entity);

    return {
      id: saved.id,
      token: rawToken, // Raw token returned ONCE only — never stored in plaintext
      label: saved.label,
      agent_name: saved.agent_name,
      scopes: saved.scopes,
      last_used_at: saved.last_used_at,
      expires_at: saved.expires_at,
      created_at: saved.created_at,
    };
  }

  async listTokens(userId: string): Promise<ExternalApiTokenResponseDto[]> {
    const tokens = await this.externalApiTokenRepository.findByUserId(userId);
    return tokens.map((t) => ({
      id: t.id,
      label: t.label,
      agent_name: t.agent_name,
      scopes: t.scopes,
      last_used_at: t.last_used_at,
      expires_at: t.expires_at,
      created_at: t.created_at,
    }));
  }

  async listAgents(userId: string): Promise<McpAgentResponseDto[]> {
    const tokens = await this.externalApiTokenRepository.findByUserId(userId);
    // Return only tokens that have an agent_name and are not expired — these represent active AI agents
    return tokens
      .filter((t) => t.agent_name && (!t.expires_at || new Date(t.expires_at) > new Date()))
      .map((t) => ({
        id: t.id,
        agent_name: t.agent_name,
        label: t.label,
        scopes: t.scopes,
        created_at: t.created_at,
      }));
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const existing = await this.externalApiTokenRepository.findByUserIdAndId(userId, tokenId);
    if (!existing) {
      throw new NotFoundException('Token not found');
    }
    await this.externalApiTokenRepository.deleteByUserIdAndId(userId, tokenId);
  }
}
