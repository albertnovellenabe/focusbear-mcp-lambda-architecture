import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ExternalMcpTasksService } from '../services/external-mcp-tasks.service';
import { ExternalApiTokenGuard, McpUser, McpScopes, McpTokenId } from '../guards/external-api-token.guard';
import { GetToDosQueryDto } from '../../to-do/dto/get-to-dos-query.dto';
import { ToDoResponse } from '../../to-do/dto/to-do-response.dto';
import { TaskComment } from '../../to-do/entities/task-comment.entity';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto';
import { AddTaskNoteDto } from '../dto/add-task-note.dto';
import { EnsureProjectStatusDto, EnsureProjectStatusResponseDto } from '../dto/ensure-project-status.dto';
import { PaginationDto } from '../../../shared/pagination/index.dto';
import { InternalServiceGuard } from '../guards/internal-service.guard';

@Controller('mcp/tasks')
@ApiTags('mcp-tasks')
@UseGuards(InternalServiceGuard, ExternalApiTokenGuard)
@ApiSecurity('McpBearerToken')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class ExternalMcpTasksController {
  constructor(private readonly externalMcpTasksService: ExternalMcpTasksService) {}

  @Get()
  @ApiOperation({
    summary: 'List tasks assigned to the authenticated agent',
    description:
      'Returns tasks where assigned_mcp_token_id matches the authenticated bearer token. Requires scope: tasks:read.',
  })
  async listTasks(
    @McpUser() userId: string,
    @McpTokenId() tokenId: string,
    @McpScopes() scopes: string[],
    @Query() query: GetToDosQueryDto,
  ): Promise<PaginationDto<ToDoResponse>> {
    return this.externalMcpTasksService.listTasks(userId, tokenId, scopes, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single task assigned to the agent',
    description:
      'Returns the full detail for a task assigned to the authenticated agent. Returns 404 if the task ' +
      'does not exist or is not assigned to this agent. Requires scope: tasks:read.',
  })
  async getTask(
    @McpUser() userId: string,
    @McpTokenId() tokenId: string,
    @McpScopes() scopes: string[],
    @Param('id', ParseUUIDPipe) taskId: string,
  ): Promise<ToDoResponse> {
    return this.externalMcpTasksService.getTask(userId, tokenId, scopes, taskId);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update task status (core or custom)',
    description:
      'Updates the status of a task assigned to this agent. Accepts either a core ToDoStatus enum value ' +
      '(status field) or a project-level custom status ID (custom_status_id field). At least one must be provided. ' +
      'Requires scope: tasks:write.',
  })
  async updateTaskStatus(
    @McpUser() userId: string,
    @McpTokenId() tokenId: string,
    @McpScopes() scopes: string[],
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<ToDoResponse> {
    return this.externalMcpTasksService.updateTaskStatus(userId, tokenId, scopes, taskId, dto);
  }

  /**
   * @deprecated Use PATCH /:id/status instead. Kept for backward compatibility.
   */
  @Put(':id/status')
  @ApiOperation({
    summary: '[Deprecated] Update task status — use PATCH instead',
    description: 'Deprecated alias for PATCH /:id/status. Will be removed in a future release.',
  })
  async updateTaskStatusLegacy(
    @McpUser() userId: string,
    @McpTokenId() tokenId: string,
    @McpScopes() scopes: string[],
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<ToDoResponse> {
    return this.externalMcpTasksService.updateTaskStatus(userId, tokenId, scopes, taskId, dto);
  }

  @Post(':id/notes')
  @ApiOperation({
    summary: 'Add a note to a task',
    description: 'Adds a comment/note to a task assigned to this agent. Requires scope: tasks:write.',
  })
  async addNote(
    @McpUser() userId: string,
    @McpTokenId() tokenId: string,
    @McpScopes() scopes: string[],
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: AddTaskNoteDto,
  ): Promise<TaskComment> {
    return this.externalMcpTasksService.addNote(userId, tokenId, scopes, taskId, dto);
  }

  // Note: This route resolves as POST /mcp/tasks/project-statuses — intentionally placed under the
  // tasks controller since project status management is tightly coupled to task assignment workflow.
  // NestJS resolves static segments ('project-statuses') before parameterised ones (':id'), so no
  // route collision exists. If standalone project endpoints are added later, extract to a dedicated
  // @Controller('mcp/projects') controller.
  @Post('project-statuses')
  @ApiOperation({
    summary: 'Ensure a custom status exists on a project',
    description:
      'Idempotent: if a status with the same label (case-insensitive) already exists on the project, ' +
      'it is returned as-is. Otherwise a new status is created and appended. ' +
      'User must be the project owner or an accepted member. Requires scope: tasks:write.',
  })
  async ensureProjectStatus(
    @McpUser() userId: string,
    @McpScopes() scopes: string[],
    @Body() dto: EnsureProjectStatusDto,
  ): Promise<EnsureProjectStatusResponseDto> {
    return this.externalMcpTasksService.ensureProjectStatus(userId, scopes, dto);
  }
}
