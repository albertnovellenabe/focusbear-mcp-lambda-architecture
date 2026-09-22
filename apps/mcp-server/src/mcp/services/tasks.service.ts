import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { UpdateTaskStatusDto } from '../dto/update-task-status.dto';
import { AddTaskNoteDto } from '../dto/add-task-note.dto';
import { EnsureProjectStatusDto, EnsureProjectStatusResponseDto } from '../dto/ensure-project-status.dto';
import { Server } from 'http';

@Injectable()
export class TasksService {
  private readonly apiUrl: string;
  private readonly internalKey: string;

  constructor(private readonly httpService: HttpService) {
    this.apiUrl = process.env.MAIN_API_URL || 'http://localhost:4000';

    this.internalKey = process.env.INTERNAL_SERVICE_KEY || '';
    if (!this.internalKey) {
      throw new Error('INTERNAL_SERVICE_KEY environment variable is not set');
    }
  }

  async listTasks(mcpToken: string, query: any): Promise<any> {
    return this.makeApiRequest('GET', `/mcp/tasks`, mcpToken, query);
  }

  async getTask(mcpToken: string, taskId: string): Promise<any> {
    return this.makeApiRequest('GET', `/mcp/tasks/${taskId}`, mcpToken);
  }

  async updateTaskStatus(mcpToken: string, taskId: string, dto: UpdateTaskStatusDto): Promise<any> {
    if (!dto.status && !dto.custom_status_id) {
      throw new BadRequestException('Provide at least one of: status, custom_status_id');
    }
    return this.makeApiRequest('PATCH', `/mcp/tasks/${taskId}/status`, mcpToken, undefined, dto);
  }

  async addNote(mcpToken: string, taskId: string, dto: AddTaskNoteDto): Promise<any> {
    return this.makeApiRequest('POST', `/mcp/tasks/${taskId}/notes`, mcpToken, undefined, dto);
  }

  async ensureProjectStatus(mcpToken: string, dto: EnsureProjectStatusDto): Promise<EnsureProjectStatusResponseDto> {
    return this.makeApiRequest('POST', `/mcp/tasks/project-statuses`, mcpToken, undefined, dto);
  }

  /**
   * Centralized HTTP request handler to catch and forward API server errors cleanly
   */
  private async makeApiRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    mcpToken: string,
    params?: any,
    data?: any,
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url: `${this.apiUrl}${path}`,
          params,
          data,
          timeout: 5000,
          headers: {
            authorization: `Bearer ${mcpToken}`,
            'x-internal-service-key': this.internalKey,
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      // If the API server returns an error, we throw the exact same error to the agent
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 404) throw new NotFoundException(message);
      if (status === 400) throw new BadRequestException(message);
      if (status === 401) throw new UnauthorizedException(message);

      throw new InternalServerErrorException(`API Server Error: ${message}`);
    }
  }
}
