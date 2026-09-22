// apps/mcp-server/src/auth/external-mcp.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

// Local standalone auth imports we just created
import { IsAuth } from './guards/is-auth.guard';
// import { AuthContext, Passport } from './decorators/auth.decorator';
import { AuthContext } from './decorators/auth.decorator';
import { Passport } from './domain/passport.model'; // <-- Point to the new file!
import { ExternalMcpAuthService } from './auth.service';

// DTO imports (Make sure these paths match where you saved your DTOs!)
import { CreateExternalApiTokenDto } from './dto/create-external-api-token.dto';
import { ExternalApiTokenIssuedResponseDto, ExternalApiTokenResponseDto } from './dto/external-api-token-response.dto';
import { McpAgentResponseDto } from './dto/mcp-agent-response.dto';

@Controller('mcp/auth')
@ApiTags('mcp-auth')
@UseGuards(IsAuth)
@ApiSecurity('Auth0AccessToken')
export class ExternalMcpAuthController {
  constructor(private readonly externalMcpAuthService: ExternalMcpAuthService) {}

  @Post('tokens')
  @ApiOperation({
    summary: 'Issue a new MCP access token',
    description: 'Generates a scoped access token for an MCP client.',
  })
  async issueToken(
    @AuthContext() { user }: Passport,
    @Body() dto: CreateExternalApiTokenDto,
    @Headers('authorization') authorization?: string,
  ): Promise<ExternalApiTokenIssuedResponseDto> {
    return this.externalMcpAuthService.issueToken(authorization, dto);
  }

  @Get('tokens')
  @ApiOperation({
    summary: 'List active MCP connections',
  })
  async listTokens(
    @AuthContext() { user }: Passport,
    @Headers('authorization') authorization?: string,
  ): Promise<ExternalApiTokenResponseDto[]> {
    return this.externalMcpAuthService.listTokens(authorization);
  }

  @Delete('tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke an MCP access token',
  })
  async revokeToken(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() { user }: Passport,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    return this.externalMcpAuthService.revokeToken(authorization, id);
  }

  @Get('agents')
  @ApiOperation({
    summary: 'List MCP agents for the current user',
  })
  async listAgents(
    @AuthContext() { user }: Passport,
    @Headers('authorization') authorization?: string,
  ): Promise<McpAgentResponseDto[]> {
    return this.externalMcpAuthService.listAgents(authorization);
  }
}
