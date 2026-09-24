import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ToDoRepository } from '../../to-do/repositories/to-do.repository';
import { TaskCommentRepository } from '../../to-do/repositories/task-comment.repository';
import { GetToDosQueryDto } from '../../to-do/dto/get-to-dos-query.dto';
import { ToDoResponse } from '../../to-do/dto/to-do-response.dto';
import { TaskComment } from '../../to-do/entities/task-comment.entity';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto';
import { AddTaskNoteDto } from '../dto/add-task-note.dto';
import { McpScope } from '../domain/mcp-scopes.enum';
import { PaginationDto } from '../../../shared/pagination/index.dto';
import { PaginationMetaDto } from '../../../shared/pagination/pagination-meta.dto';
import { EnsureProjectStatusDto, EnsureProjectStatusResponseDto } from '../dto/ensure-project-status.dto';
import { ProjectRepository } from '../../project/repositories/project.repository';
import { ProjectMemberInvitationStatus } from '../../project/domain/project-member-invitation-status.enum';

@Injectable()
export class ExternalMcpTasksService {
  constructor(
    private readonly toDoRepository: ToDoRepository,
    private readonly taskCommentRepository: TaskCommentRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async listTasks(
    userId: string,
    tokenId: string,
    scopes: string[],
    query: GetToDosQueryDto,
  ): Promise<PaginationDto<ToDoResponse>> {
    this.requireScope(scopes, McpScope.TASKS_READ);
    const [items, total] = await this.toDoRepository.getAgentAssignedToDos(userId, tokenId, query);
    return new PaginationDto(
      items as unknown as ToDoResponse[],
      new PaginationMetaDto({ paginationOptionsDto: query, itemCount: total }),
    );
  }

  async getTask(userId: string, tokenId: string, scopes: string[], taskId: string): Promise<ToDoResponse> {
    this.requireScope(scopes, McpScope.TASKS_READ);

    const task = await this.toDoRepository.orm.findOne({
      where: { id: taskId, user_id: userId, assigned_mcp_token_id: tokenId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found or not assigned to this agent`);
    }

    return task as unknown as ToDoResponse;
  }

  async updateTaskStatus(
    userId: string,
    tokenId: string,
    scopes: string[],
    taskId: string,
    dto: UpdateTaskStatusDto,
  ): Promise<ToDoResponse> {
    this.requireScope(scopes, McpScope.TASKS_WRITE);

    if (!dto.status && !dto.custom_status_id) {
      throw new BadRequestException('Provide at least one of: status, custom_status_id');
    }

    const task = await this.toDoRepository.orm.findOne({
      where: { id: taskId, user_id: userId, assigned_mcp_token_id: tokenId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found or not assigned to this agent`);
    }

    const updates: Record<string, any> = {};
    if (dto.status) {
      updates.status = dto.status;
    }
    if (dto.custom_status_id) {
      updates.custom_status_id = dto.custom_status_id;
    }

    return this.toDoRepository.update(taskId, updates) as Promise<ToDoResponse>;
  }

  async addNote(
    userId: string,
    tokenId: string,
    scopes: string[],
    taskId: string,
    dto: AddTaskNoteDto,
  ): Promise<TaskComment> {
    this.requireScope(scopes, McpScope.TASKS_WRITE);

    const task = await this.toDoRepository.orm.findOne({
      where: { id: taskId, user_id: userId, assigned_mcp_token_id: tokenId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found or not assigned to this agent`);
    }

    const comment = new TaskComment(
      {
        task_id: taskId,
        user_id: userId,
        content: dto.content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { generateId: true },
    );

    return this.taskCommentRepository.orm.save(comment);
  }

  /**
   * Ensures a custom project status with the given label exists, creating it if not.
   *
   * Idempotency is guaranteed under concurrent writes via a `FOR UPDATE` transaction
   * lock in the repository layer, which prevents TOCTOU races where two simultaneous
   * callers both find the status absent and attempt to insert duplicate entries.
   */
  async ensureProjectStatus(
    userId: string,
    scopes: string[],
    dto: EnsureProjectStatusDto,
  ): Promise<EnsureProjectStatusResponseDto> {
    this.requireScope(scopes, McpScope.TASKS_WRITE);

    const project = await this.projectRepository.getProjectById(dto.project_id);
    if (!project) {
      throw new NotFoundException(`Project ${dto.project_id} not found`);
    }

    // Verify the user has access to this project (owner or accepted member)
    const isOwner = project.owner_id === userId;
    const isMember = project.members?.some(
      (m) => m.user_id === userId && m.invitation_status === ProjectMemberInvitationStatus.ACCEPTED,
    );

    if (!isOwner && !isMember) {
      throw new NotFoundException(`Project ${dto.project_id} not found`);
    }

    // Delegate to repository which uses a FOR UPDATE transaction to prevent TOCTOU races
    return this.projectRepository.ensureCustomStatus(
      dto.project_id,
      dto.label,
      dto.color,
      dto.should_complete_task ?? false,
    );
  }

  private requireScope(scopes: string[], required: McpScope): void {
    if (!scopes.includes(required)) {
      throw new UnauthorizedException(`Token missing required scope: ${required}`);
    }
  }
}
