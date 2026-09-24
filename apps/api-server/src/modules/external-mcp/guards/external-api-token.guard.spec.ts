import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExternalApiTokenGuard, MCP_SCOPE_KEY } from './external-api-token.guard';
import { ExternalApiTokenRepository } from '../repositories/external-api-token.repository';

describe('ExternalApiTokenGuard', () => {
  let guard: ExternalApiTokenGuard;
  let reflector: Reflector;

  const mockUserId = 'user-uuid-1234';
  const mockTokenId = 'token-uuid-5678';
  const rawToken = 'deadbeef'.repeat(8); // 64-char hex token

  const externalApiTokenRepositoryMock = {
    findByRawToken: jest.fn(),
    updateLastUsed: jest.fn(),
  };

  const buildContext = (authHeader: string | undefined, handler?: object): ExecutionContext => {
    const request: any = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler ?? {},
    } as unknown as ExecutionContext;
  };

  const buildToken = (overrides: Partial<{ expires_at: Date | null; scopes: string[] }> = {}) => ({
    id: mockTokenId,
    user_id: mockUserId,
    scopes: ['tasks:read', 'tasks:write'],
    expires_at: null,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalApiTokenGuard,
        { provide: ExternalApiTokenRepository, useValue: externalApiTokenRepositoryMock },
        Reflector,
      ],
    }).compile();

    guard = module.get<ExternalApiTokenGuard>(ExternalApiTokenGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Valid token ────────────────────────────────────────────────────────────────

  describe('valid token', () => {
    it('should return true and attach userId and scopes to the request', async () => {
      const token = buildToken();
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      const ctx = buildContext(`Bearer ${rawToken}`);
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);

      const request = ctx.switchToHttp().getRequest();
      expect(request.mcpUserId).toBe(mockUserId);
      expect(request.mcpScopes).toEqual(token.scopes);
      expect(request.mcpTokenId).toBe(mockTokenId);
    });

    it('should fire-and-forget updateLastUsed without blocking the response', async () => {
      const token = buildToken();
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      const ctx = buildContext(`Bearer ${rawToken}`);
      await guard.canActivate(ctx);

      expect(externalApiTokenRepositoryMock.updateLastUsed).toHaveBeenCalledWith(mockTokenId);
    });
  });

  // ── Missing / malformed Authorization header ──────────────────────────────────

  describe('missing Authorization header', () => {
    it('should throw UnauthorizedException when Authorization header is absent', async () => {
      const ctx = buildContext(undefined);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      expect(externalApiTokenRepositoryMock.findByRawToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when header has no Bearer prefix', async () => {
      const ctx = buildContext(`Token ${rawToken}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      expect(externalApiTokenRepositoryMock.findByRawToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with descriptive message for missing header', async () => {
      const ctx = buildContext(undefined);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Missing or invalid Authorization header. Expected: Bearer <token>',
      );
    });
  });

  // ── Unknown token (not found) ─────────────────────────────────────────────────

  describe('unknown token', () => {
    it('should throw UnauthorizedException when findByRawToken returns null', async () => {
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(null);

      const ctx = buildContext(`Bearer ${rawToken}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with "Invalid or revoked token" message', async () => {
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(null);

      const ctx = buildContext(`Bearer ${rawToken}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or revoked token');
    });
  });

  // ── Expired token ─────────────────────────────────────────────────────────────

  describe('expired token', () => {
    it('should throw UnauthorizedException when token has expired', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const token = buildToken({ expires_at: pastDate });
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);

      const ctx = buildContext(`Bearer ${rawToken}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with "Token has expired" message', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);
      const token = buildToken({ expires_at: pastDate });
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);

      const ctx = buildContext(`Bearer ${rawToken}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow('Token has expired');
    });

    it('should accept a token that has not yet expired', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      const token = buildToken({ expires_at: futureDate });
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      const ctx = buildContext(`Bearer ${rawToken}`);
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  // ── Wrong scope via @RequireScope metadata ────────────────────────────────────

  describe('scope enforcement', () => {
    it('should throw UnauthorizedException when required scope is missing from token', async () => {
      const token = buildToken({ scopes: ['tasks:read'] });
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      // Simulate handler decorated with @RequireScope('tasks:write')
      const handler = { [MCP_SCOPE_KEY]: 'tasks:write' };
      jest.spyOn(reflector, 'get').mockReturnValue('tasks:write');

      const ctx = buildContext(`Bearer ${rawToken}`, handler);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when token has the required scope', async () => {
      const token = buildToken({ scopes: ['tasks:read', 'tasks:write'] });
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      jest.spyOn(reflector, 'get').mockReturnValue('tasks:write');

      const ctx = buildContext(`Bearer ${rawToken}`);
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('should return true when no scope metadata is set on the handler', async () => {
      const token = buildToken();
      externalApiTokenRepositoryMock.findByRawToken.mockResolvedValueOnce(token);
      externalApiTokenRepositoryMock.updateLastUsed.mockResolvedValueOnce(undefined);

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const ctx = buildContext(`Bearer ${rawToken}`);
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });
});
