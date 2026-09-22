import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExternalMcpAuthController } from './external-mcp-auth.controller';
import { ExternalMcpAuthService } from '../services/external-mcp-auth.service';
import { IsAuth } from '../../auth/guards/is-auth/is-auth.guard';

describe('ExternalMcpAuthController', () => {
  let controller: ExternalMcpAuthController;

  const mockUserId = 'authenticated-user-uuid';
  const passport: any = { user: { id: mockUserId } };

  const serviceMock = {
    issueToken: jest.fn(),
    listTokens: jest.fn(),
    revokeToken: jest.fn(),
    listAgents: jest.fn(),
  };

  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalMcpAuthController],
      providers: [{ provide: ExternalMcpAuthService, useValue: serviceMock }],
    }).compile();

    controller = module.get(ExternalMcpAuthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be protected by the IsAuth guard at class level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ExternalMcpAuthController);
    expect(guards).toContain(IsAuth);
  });

  describe('issueToken', () => {
    const dto: any = { scopes: ['tasks:read'], label: 'test' };
    const tokenData = { id: 'token-id', token: 'raw-token', scopes: dto.scopes, label: dto.label };

    it('issues the token for the authenticated user and returns 201 JSON', async () => {
      serviceMock.issueToken.mockResolvedValueOnce(tokenData);
      const res = makeRes();

      await controller.issueToken(passport, dto, undefined, res);

      expect(serviceMock.issueToken).toHaveBeenCalledWith(mockUserId, dto);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.send).toHaveBeenCalledWith(tokenData);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('redirects to the deep link when redirect=true', async () => {
      serviceMock.issueToken.mockResolvedValueOnce(tokenData);
      const res = makeRes();

      await controller.issueToken(passport, dto, 'true', res);

      expect(serviceMock.issueToken).toHaveBeenCalledWith(mockUserId, dto);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.FOUND);
      expect(res.redirect).toHaveBeenCalledWith('focusbear://auth?token=raw-token');
      expect(res.send).not.toHaveBeenCalled();
    });

    it('never uses a hard-coded user id', async () => {
      serviceMock.issueToken.mockResolvedValueOnce(tokenData);
      const otherPassport: any = { user: { id: 'a-different-user' } };

      await controller.issueToken(otherPassport, dto, undefined, makeRes());

      expect(serviceMock.issueToken).toHaveBeenCalledWith('a-different-user', dto);
    });
  });

  describe('listTokens / revokeToken / listAgents', () => {
    it('listTokens uses the authenticated user id', async () => {
      serviceMock.listTokens.mockResolvedValueOnce([]);
      await controller.listTokens(passport);
      expect(serviceMock.listTokens).toHaveBeenCalledWith(mockUserId);
    });

    it('revokeToken uses the authenticated user id', async () => {
      serviceMock.revokeToken.mockResolvedValueOnce(undefined);
      await controller.revokeToken('token-id', passport);
      expect(serviceMock.revokeToken).toHaveBeenCalledWith(mockUserId, 'token-id');
    });

    it('listAgents uses the authenticated user id', async () => {
      serviceMock.listAgents.mockResolvedValueOnce([]);
      await controller.listAgents(passport);
      expect(serviceMock.listAgents).toHaveBeenCalledWith(mockUserId);
    });
  });
});
