import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ExternalMcpTasksService } from './external-mcp-tasks.service';
import { ToDoRepository } from '../../to-do/repositories/to-do.repository';
import { TaskCommentRepository } from '../../to-do/repositories/task-comment.repository';
import { ProjectRepository } from '../../project/repositories/project.repository';
import { McpScope } from '../domain/mcp-scopes.enum';
import { ToDoStatus } from '../../to-do/domain/to-do-status.enum';

describe('ExternalMcpTasksService', () => {
  let service: ExternalMcpTasksService;

  const mockUserId = 'user-uuid-1234';
  const mockTokenId = 'token-uuid-9999';
  const mockTaskId = 'task-uuid-5678';
  const mockProjectId = 'project-uuid-0001';

  const mockToDoRepository = {
    getAgentAssignedToDos: jest.fn(),
    orm: {
      findOne: jest.fn(),
    },
    update: jest.fn(),
  };

  const mockTaskCommentRepository = {
    orm: {
      save: jest.fn(),
    },
  };

  const mockProjectRepository = {
    getProjectById: jest.fn(),
    ensureCustomStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalMcpTasksService,
        {
          provide: ToDoRepository,
          useValue: mockToDoRepository,
        },
        {
          provide: TaskCommentRepository,
          useValue: mockTaskCommentRepository,
        },
        {
          provide: ProjectRepository,
          useValue: mockProjectRepository,
        },
      ],
    }).compile();

    service = module.get<ExternalMcpTasksService>(ExternalMcpTasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── listTasks ────────────────────────────────────────────────────────────────

  describe('listTasks', () => {
    const query = { page: 1, take: 10, skip: 0, order: 'ASC' } as any;

    it('should return PaginationDto filtered by tokenId when scope is present', async () => {
      const mockTasks = [{ id: mockTaskId, title: 'Test task', assigned_mcp_token_id: mockTokenId }];
      mockToDoRepository.getAgentAssignedToDos.mockResolvedValueOnce([mockTasks, 1]);

      const result = await service.listTasks(mockUserId, mockTokenId, [McpScope.TASKS_READ], query);

      expect(result).toHaveProperty('data', mockTasks);
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('itemCount', 1);
      expect(mockToDoRepository.getAgentAssignedToDos).toHaveBeenCalledWith(mockUserId, mockTokenId, query);
    });

    it('should include completed tasks when status is omitted', async () => {
      const mockTasks = [
        { id: mockTaskId, title: 'Completed task', assigned_mcp_token_id: mockTokenId, status: ToDoStatus.COMPLETED },
      ];
      mockToDoRepository.getAgentAssignedToDos.mockResolvedValueOnce([mockTasks, 1]);

      const result = await service.listTasks(mockUserId, mockTokenId, [McpScope.TASKS_READ], query);

      expect(mockToDoRepository.getAgentAssignedToDos).toHaveBeenCalledWith(mockUserId, mockTokenId, query);
      expect(result.data).toEqual(mockTasks);
      expect(result.data[0]).toEqual(expect.objectContaining({ status: ToDoStatus.COMPLETED }));
    });

    it('should throw UnauthorizedException when tasks:read scope is missing', async () => {
      await expect(service.listTasks(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], query)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockToDoRepository.getAgentAssignedToDos).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when scopes array is empty', async () => {
      await expect(service.listTasks(mockUserId, mockTokenId, [], query)).rejects.toThrow(
        `Token missing required scope: ${McpScope.TASKS_READ}`,
      );
    });
  });

  // ── getTask ───────────────────────────────────────────────────────────────────

  describe('getTask', () => {
    it('should return the task when found and assigned to this agent', async () => {
      const mockTask = { id: mockTaskId, assigned_mcp_token_id: mockTokenId };
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(mockTask);

      const result = await service.getTask(mockUserId, mockTokenId, [McpScope.TASKS_READ], mockTaskId);

      expect(result).toEqual(mockTask);
      expect(mockToDoRepository.orm.findOne).toHaveBeenCalledWith({
        where: { id: mockTaskId, user_id: mockUserId, assigned_mcp_token_id: mockTokenId },
      });
    });

    it('should throw NotFoundException when task not found or not assigned to this agent', async () => {
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(null);

      await expect(service.getTask(mockUserId, mockTokenId, [McpScope.TASKS_READ], mockTaskId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnauthorizedException when tasks:read scope is missing', async () => {
      await expect(service.getTask(mockUserId, mockTokenId, [], mockTaskId)).rejects.toThrow(UnauthorizedException);
      expect(mockToDoRepository.orm.findOne).not.toHaveBeenCalled();
    });
  });

  // ── updateTaskStatus ──────────────────────────────────────────────────────────

  describe('updateTaskStatus', () => {
    const mockTask = { id: mockTaskId, user_id: mockUserId, assigned_mcp_token_id: mockTokenId, status: 'NOT_STARTED' };

    it('should update core status when scope and task are valid', async () => {
      const dto: any = { status: ToDoStatus.IN_PROGRESS };
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(mockTask);
      mockToDoRepository.update.mockResolvedValueOnce({ ...mockTask, status: ToDoStatus.IN_PROGRESS } as any);

      const result = await service.updateTaskStatus(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, dto);

      expect(result).toHaveProperty('status', ToDoStatus.IN_PROGRESS);
      expect(mockToDoRepository.orm.findOne).toHaveBeenCalledWith({
        where: { id: mockTaskId, user_id: mockUserId, assigned_mcp_token_id: mockTokenId },
      });
      expect(mockToDoRepository.update).toHaveBeenCalledWith(mockTaskId, { status: dto.status });
    });

    it('should update custom_status_id when provided', async () => {
      const dto: any = { custom_status_id: 'ready-for-human-review' };
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(mockTask);
      mockToDoRepository.update.mockResolvedValueOnce({ ...mockTask, custom_status_id: dto.custom_status_id } as any);

      const result = await service.updateTaskStatus(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, dto);

      expect(mockToDoRepository.update).toHaveBeenCalledWith(mockTaskId, { custom_status_id: dto.custom_status_id });
      expect(result).toHaveProperty('custom_status_id', dto.custom_status_id);
    });

    it('should throw BadRequestException when neither status nor custom_status_id provided', async () => {
      const dto: any = {};

      await expect(
        service.updateTaskStatus(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockToDoRepository.orm.findOne).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when tasks:write scope is missing', async () => {
      await expect(
        service.updateTaskStatus(mockUserId, mockTokenId, [McpScope.TASKS_READ], mockTaskId, {
          status: ToDoStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockToDoRepository.orm.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when task not assigned to this agent', async () => {
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateTaskStatus(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, {
          status: ToDoStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockToDoRepository.update).not.toHaveBeenCalled();
    });
  });

  // ── addNote ───────────────────────────────────────────────────────────────────

  describe('addNote', () => {
    const dto: any = { content: 'Great progress on this task!' };
    const mockTask = { id: mockTaskId, user_id: mockUserId, assigned_mcp_token_id: mockTokenId };

    it('should add a note when scope and task are valid', async () => {
      const savedComment = {
        id: 'comment-uuid-0001',
        task_id: mockTaskId,
        user_id: mockUserId,
        content: dto.content,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      };

      mockToDoRepository.orm.findOne.mockResolvedValueOnce(mockTask);
      mockTaskCommentRepository.orm.save.mockResolvedValueOnce(savedComment);

      const result = await service.addNote(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, dto);

      expect(result).toHaveProperty('task_id', mockTaskId);
      expect(result).toHaveProperty('user_id', mockUserId);
      expect(result).toHaveProperty('content', dto.content);
      expect(mockToDoRepository.orm.findOne).toHaveBeenCalledWith({
        where: { id: mockTaskId, user_id: mockUserId, assigned_mcp_token_id: mockTokenId },
      });
      expect(mockTaskCommentRepository.orm.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when tasks:write scope is missing', async () => {
      await expect(service.addNote(mockUserId, mockTokenId, [McpScope.TASKS_READ], mockTaskId, dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockToDoRepository.orm.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when task not assigned to this agent', async () => {
      mockToDoRepository.orm.findOne.mockResolvedValueOnce(null);

      await expect(service.addNote(mockUserId, mockTokenId, [McpScope.TASKS_WRITE], mockTaskId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockTaskCommentRepository.orm.save).not.toHaveBeenCalled();
    });
  });

  // ── ensureProjectStatus ───────────────────────────────────────────────────────

  describe('ensureProjectStatus', () => {
    const dto: any = {
      project_id: mockProjectId,
      label: 'Ready for human review',
      color: '#F59E0B',
      should_complete_task: false,
    };

    const mockProject = {
      id: mockProjectId,
      owner_id: mockUserId,
      members: [],
      custom_statuses: [
        { id: 'default-todo', label: 'To Do', color: '#6B7280', order: 0, should_complete_task: false },
        { id: 'default-done', label: 'Done', color: '#10B981', order: 1, should_complete_task: true },
      ],
    };

    it('should create a new status when label does not exist', async () => {
      mockProjectRepository.getProjectById.mockResolvedValueOnce(mockProject);
      mockProjectRepository.ensureCustomStatus.mockResolvedValueOnce({
        id: 'new-status-id',
        label: dto.label,
        color: dto.color,
        order: 2,
        should_complete_task: false,
        already_existed: false,
      });

      const result = await service.ensureProjectStatus(mockUserId, [McpScope.TASKS_WRITE], dto);

      expect(result.label).toBe(dto.label);
      expect(result.color).toBe(dto.color);
      expect(result.already_existed).toBe(false);
      expect(result.order).toBe(2);
      expect(mockProjectRepository.ensureCustomStatus).toHaveBeenCalledWith(
        dto.project_id,
        dto.label,
        dto.color,
        dto.should_complete_task,
      );
    });

    it('should return existing status when label already exists (case-insensitive)', async () => {
      mockProjectRepository.getProjectById.mockResolvedValueOnce(mockProject);
      mockProjectRepository.ensureCustomStatus.mockResolvedValueOnce({
        id: 'existing-id',
        label: 'Ready For Human Review',
        color: '#FF0000',
        order: 2,
        should_complete_task: false,
        already_existed: true,
      });

      const result = await service.ensureProjectStatus(mockUserId, [McpScope.TASKS_WRITE], dto);

      expect(result.id).toBe('existing-id');
      expect(result.already_existed).toBe(true);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.getProjectById.mockResolvedValueOnce(null);

      await expect(service.ensureProjectStatus(mockUserId, [McpScope.TASKS_WRITE], dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user is not owner or member', async () => {
      const otherProject = { ...mockProject, owner_id: 'other-user', members: [] };
      mockProjectRepository.getProjectById.mockResolvedValueOnce(otherProject);

      await expect(service.ensureProjectStatus(mockUserId, [McpScope.TASKS_WRITE], dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnauthorizedException when tasks:write scope is missing', async () => {
      await expect(service.ensureProjectStatus(mockUserId, [McpScope.TASKS_READ], dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockProjectRepository.getProjectById).not.toHaveBeenCalled();
    });
  });
});
