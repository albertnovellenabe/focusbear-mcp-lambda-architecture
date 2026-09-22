import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { IsAuth } from '../../auth/guards/is-auth/is-auth.guard';
import { AuthContext } from '../../../shared/decorators/passport.decorator';
import { Passport } from '../../auth/domain/passport.model';
import { ExternalMcpAuthService } from '../services/external-mcp-auth.service';
import { CreateExternalApiTokenDto } from '../dto/create-external-api-token.dto';
import { ExternalApiTokenResponseDto } from '../dto/external-api-token-response.dto';
import { McpAgentResponseDto } from '../dto/mcp-agent-response.dto';

@Controller('mcp/auth')
@ApiTags('mcp-auth')
@UseGuards(IsAuth)
@ApiSecurity('Auth0AccessToken')
export class ExternalMcpAuthController {
  constructor(private readonly externalMcpAuthService: ExternalMcpAuthService) {}

  @Post('tokens')
  @ApiOperation({
    summary: 'Issue a new MCP access token',
    description:
      'Generates a scoped access token for an MCP client to access this Focus Bear account. ' +
      'The raw token is returned ONCE and cannot be retrieved again. ' +
      'Use ?redirect=true for mobile deep linking, or omit it to get raw JSON.',
  })
  async issueToken(
    @AuthContext() { user }: Passport,
    @Body() dto: CreateExternalApiTokenDto,
    @Query('redirect') redirect: string,
    @Res() res: FastifyReply,
  ) {
    const tokenData = await this.externalMcpAuthService.issueToken(user.id, dto);

    if (redirect === 'true') {
      const deepLinkUrl = `focusbear://auth?token=${tokenData.token}`;
      return res.status(HttpStatus.FOUND).redirect(deepLinkUrl);
    }

    return res.status(HttpStatus.CREATED).send(tokenData);
  }

  @Get('tokens')
  @ApiOperation({
    summary: 'List active MCP connections',
    description: 'Returns all active MCP tokens for this user. Raw tokens are never returned.',
  })
  async listTokens(@AuthContext() { user }: Passport): Promise<ExternalApiTokenResponseDto[]> {
    return this.externalMcpAuthService.listTokens(user.id);
  }

  @Delete('tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke an MCP access token',
    description: 'Immediately invalidates the specified token. The MCP client will no longer be able to access data.',
  })
  async revokeToken(@Param('id', ParseUUIDPipe) id: string, @AuthContext() { user }: Passport): Promise<void> {
    return this.externalMcpAuthService.revokeToken(user.id, id);
  }

  @Get('agents')
  @ApiOperation({
    summary: 'List MCP agents for the current user',
    description:
      'Returns all MCP tokens that have an agent_name set. Use the token id as assigned_mcp_token_id ' +
      'when assigning tasks to an AI agent via the tasks API.',
  })
  async listAgents(@AuthContext() { user }: Passport): Promise<McpAgentResponseDto[]> {
    return this.externalMcpAuthService.listAgents(user.id);
  }
}
