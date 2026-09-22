/*
import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { TasksService } from './services/tasks.service';

@Injectable()
export class McpService {
  private connections = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly tasksService: TasksService) {}

  initializeSseStream(userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.connections.set(userId, subject);

    setTimeout(() => {
      subject.next({
        data: { endpoint: '/mcp/messages' },
        type: 'endpoint',
      });
    }, 100);

    return subject.asObservable();
  }

  async handleIncomingMessage(userId: string, message: any) {
    const { method, params, id } = message;

    // Dev-mode: MCP server authenticates to api-server using a configured agent token.
    // This keeps mcp-server thin (no DB) while api-server stays source-of-truth.
    const mcpAgentToken = process.env.MCP_AGENT_TOKEN;

    const stream = this.connections.get(userId);

    let responsePayload: any;

    try {
      if (method === 'tools/list') {
        responsePayload = {
          id,
          result: {
            tools: [
              {
                name: 'list_tasks',
                description: 'Fetch the active tasks assigned to this AI agent',
                inputSchema: { type: 'object', properties: {} }, // Add query params here later
              },
              {
                name: 'update_task_status',
                description: 'Update the status of a specific task',
                inputSchema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: 'The UUID of the task' },
                    status: { type: 'string', description: 'The new status' },
                  },
                  required: ['taskId', 'status'],
                },
              },
            ],
          },
        };
      } else if (method === 'tools/call') {
        if (!mcpAgentToken) throw new Error('MCP_AGENT_TOKEN is not set');

        if (params.name === 'list_tasks') {
          const tasks = await this.tasksService.listTasks(mcpAgentToken, {});
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(tasks) }] } };
        } else if (params.name === 'update_task_status') {
          const updatedTask = await this.tasksService.updateTaskStatus(mcpAgentToken, params.arguments.taskId, {
            status: params.arguments.status,
          });
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(updatedTask) }] } };
        } else {
          responsePayload = { id, error: { code: -32601, message: `Tool ${params.name} not found` } };
        }
      } else {
        responsePayload = { id, error: { code: -32601, message: 'Method not found' } };
      }
    } catch (error: any) {
      responsePayload = { id, error: { code: -32000, message: error.message } };
    }

    // 2. PUSH THE DATA DOWN THE SSE TUNNEL!
    if (stream) {
      stream.next({ data: responsePayload } as MessageEvent);
    } else {
      console.warn(`No active SSE stream found for user ${userId}`);
    }

    // 3. Return a simple acknowledgment to the POST request
    return { status: 'Accepted' };
  }
}*/
import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from './services/tasks.service';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(private readonly tasksService: TasksService) {}

  // This replaces both initializeSseStream and handleIncomingMessage
  async handleStreamRequest1111111(body: any, userJwt: string, responseStream: any) {
    const { method, params, id } = body;
    const mcpAgentToken = process.env.MCP_AGENT_TOKEN;

    let responsePayload: any;

    try {
      this.logger.log(`Processing MCP method: ${method}`);

      if (method === 'tools/list') {
        responsePayload = {
          id,
          result: {
            tools: [
              {
                name: 'list_tasks',
                description: 'Fetch the active tasks assigned to this AI agent',
                inputSchema: { type: 'object', properties: {} },
              },
              {
                name: 'update_task_status',
                description: 'Update the status of a specific task',
                inputSchema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: 'The UUID of the task' },
                    status: { type: 'string', description: 'The new status' },
                  },
                  required: ['taskId', 'status'],
                },
              },
            ],
          },
        };
      } else if (method === 'tools/call') {
        if (!mcpAgentToken) throw new Error('MCP_AGENT_TOKEN is not set');

        if (params.name === 'list_tasks') {
          const tasks = await this.tasksService.listTasks(mcpAgentToken, {});
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(tasks) }] } };
        } else if (params.name === 'update_task_status') {
          const updatedTask = await this.tasksService.updateTaskStatus(mcpAgentToken, params.arguments.taskId, {
            status: params.arguments.status,
          });
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(updatedTask) }] } };
        } else {
          responsePayload = { id, error: { code: -32601, message: `Tool ${params.name} not found` } };
        }
      } else {
        responsePayload = { id, error: { code: -32601, message: 'Method not found' } };
      }
    } catch (error: any) {
      this.logger.error(`Error processing MCP request: ${error.message}`);
      responsePayload = { id, error: { code: -32000, message: error.message } };
    }

    // PUSH THE DATA DOWN THE AWS SSE TUNNEL!
    // Notice how we format it as 'data: {...}\n\n' which is the SSE standard
    responseStream.write(`data: ${JSON.stringify(responsePayload)}\n\n`);
  }

  // This replaces both initializeSseStream and handleIncomingMessage
  async handleStreamRequest(body: any, userJwt: string, responseStream: any) {
    const { method, params, id } = body;

    // 1. EXTRAT AND VALIDATE THE TOKEN
    // userJwt usually comes in as "Bearer 6dcc..." or just "Bearer "
    const actualToken = userJwt?.replace('Bearer ', '').trim();

    // 2. THE BOUNCER LOGIC
    if (!actualToken) {
      this.logger.warn('Blocked MCP request: Missing Bearer token');
      // Immediately return a 401 error and stop processing
      responseStream.write(
        `data: ${JSON.stringify({
          id,
          error: { code: 401, message: 'Unauthorized: Missing or invalid token' },
        })}\n\n`,
      );
      return;
    }

    let responsePayload: any;

    try {
      this.logger.log(`Processing MCP method: ${method}`);

      if (method === 'tools/list') {
        responsePayload = {
          id,
          result: {
            tools: [
              {
                name: 'list_tasks',
                description: 'Fetch the active tasks assigned to this AI agent',
                inputSchema: { type: 'object', properties: {} },
              },
              {
                name: 'update_task_status',
                description: 'Update the status of a specific task',
                inputSchema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: 'The UUID of the task' },
                    status: { type: 'string', description: 'The new status' },
                  },
                  required: ['taskId', 'status'],
                },
              },
            ],
          },
        };
      } else if (method === 'tools/call') {
        // 3. USE THE DYNAMIC TOKEN INSTEAD OF THE HARDCODED ONE
        if (params.name === 'list_tasks') {
          const tasks = await this.tasksService.listTasks(actualToken, {});
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(tasks) }] } };
        } else if (params.name === 'update_task_status') {
          const updatedTask = await this.tasksService.updateTaskStatus(actualToken, params.arguments.taskId, {
            status: params.arguments.status,
          });
          responsePayload = { id, result: { content: [{ type: 'text', text: JSON.stringify(updatedTask) }] } };
        } else {
          responsePayload = { id, error: { code: -32601, message: `Tool ${params.name} not found` } };
        }
      } else {
        responsePayload = { id, error: { code: -32601, message: 'Method not found' } };
      }
    } catch (error: any) {
      this.logger.error(`Error processing MCP request: ${error.message}`);
      responsePayload = { id, error: { code: -32000, message: error.message } };
    }

    // PUSH THE DATA DOWN THE AWS SSE TUNNEL!
    responseStream.write(`data: ${JSON.stringify(responsePayload)}\n\n`);
  }
}
