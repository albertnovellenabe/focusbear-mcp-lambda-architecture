# MCP codebase status

Planner Link: https://planner.cloud.microsoft/webui/v1/plan/ZWrjNSLeuUepoloDBteSqMgAANbR?tid=d1323671-cdbe-4417-b4d4-bdb24b51316b 

**Audience:** project manager, current developers, and Cursor
**Repository snapshot:** `auditing-branch` at `0c6a5ea0` (25 August 2026)
**Assessment basis:** source, configuration, tracked artifacts, and Git history in this checkout. No live AWS environment was inspected.

## Executive summary

The repository contains a meaningful backend MCP foundation. The NestJS API has scoped MCP tokens, token hashing and revocation, agent assignment to tasks, and MCP-facing task operations. A separate NestJS `apps/mcp-server` project also contains a Lambda streaming handler, a local simulator, and a small hand-written MCP dispatcher.

The system is not a production-ready MCP server on AWS Lambda. The Lambda transport is only partially prototyped, the dispatcher appears to support only `tools/list` and `tools/call`, authentication setup contains a hard-coded user identity and commented-out guards, development secrets have unsafe fallbacks, and this repository does not define or deploy an MCP-specific AWS entry point. Local build and test status could not be verified because `node_modules` is absent.

## What this repository currently contains

- The main [NestJS API server](apps/api-server/src) and its database migrations, repositories, controllers, and services.
- A separate [MCP server application](apps/mcp-server/src) that is intended to be a thin adapter over the API server.
- The API-side [external MCP module](apps/api-server/src/modules/external-mcp/external-mcp.module.ts). As of Task 14, the implementation was merged directly into this directory; the previous re-export shim and the recovery-style `external-mcp_fffff` directory no longer exist.
- General API and cron build/deployment workflows, plus a committed generated [`dist-mcp`](dist-mcp) tree. The generated tree contains 507 tracked files in this snapshot and should not be assumed to be the canonical source.
- Planning documents for the original OpenClaw/MCP work and the later agent-task integration: [MCP server plan](plans/issue-1719-mcp-server-tasks.md) and [agent task integration plan](plans/mcp-agent-task-integration.md).

## Architecture overview

### Implemented in source

1. A Focus Bear user is intended to manage scoped MCP access tokens through `mcp/auth` routes on the API.
2. The API stores token metadata in `external_api_tokens`. Raw tokens are generated once, hashed with the shared crypto service, looked up through a hash-derived prefix, checked for expiry, and revocable.
3. Tasks can carry an `assigned_mcp_token_id`, allowing the API to restrict an agent to tasks assigned to that token rather than exposing all of the user’s tasks.
4. MCP task requests reach API routes under `mcp/tasks`. The API guard supplies the authenticated user ID, token ID, and scopes to the task controller/service.
5. The separate Lambda adapter receives an event body and bearer header, obtains a cached Nest application context, and passes the request to `McpService`. Its `TasksService` forwards API calls with the MCP bearer token and an internal service key.

### Current AWS boundary

The repository’s existing AWS workflow builds the general API image with [`Dockerfile.aws`](Dockerfile.aws), pushes it to the configured ECR repository, and updates separate server and cron CloudFormation stacks in [production deployment](.github/workflows/github-aws-prod-deployment.yaml) and [hotfix deployment](.github/workflows/github-aws-hotfix-deploy.yaml). Those workflows do not build or deploy the MCP Lambda image.

[`apps/mcp-server/Dockerfile.mcp`](apps/mcp-server/Dockerfile.mcp) and [`apps/mcp-server/src/main.ts`](apps/mcp-server/src/main.ts) show an intended Lambda path, but no MCP-specific API Gateway, ALB target, Lambda Function URL, Lambda resource, IAM policy, ECR image workflow, CloudFormation/SAM/CDK stack, domain mapping, or deployment smoke test is defined in this repository. Any external AWS infrastructure repository is a separate dependency to verify.

## Status by capability

| Capability | Status | What the checkout supports or does not prove |
|---|---|---|
| MCP token table and migrations | **Implemented** | The migrations create `external_api_tokens`, add `agent_name`, and add the task assignment foreign key. See [token migration](apps/api-server/migrations/1772924400000-create-external-api-tokens-table.ts), [agent-name migration](apps/api-server/migrations/1773025000001-add-agent-name-to-external-api-tokens.ts), and [assignment migration](apps/api-server/migrations/1773025000002-add-assigned-mcp-token-id-to-todo.ts). |
| Token hashing, prefix lookup, scopes, expiry, last-used tracking, and revocation | **Implemented** | The entity, repository, auth service, and bearer guard implement these mechanisms in the [MCP auth module](apps/api-server/src/modules/external-mcp). This is a source-level finding; migrations and runtime behavior were not executed locally. |
| Agent assignment and authorization boundary | **Implemented** | The task entity and repository filter by `assigned_mcp_token_id`; the controller requires `tasks:read` or `tasks:write` as appropriate. See [task guard](apps/api-server/src/modules/external-mcp/guards/external-api-token.guard.ts) and [task service](apps/api-server/src/modules/external-mcp/services/external-mcp-tasks.service.ts). |
| API task operations | **Implemented** | The API source includes task listing, task detail, core/custom status updates, notes, and idempotent project-status creation in [external-mcp-tasks.controller.ts](apps/api-server/src/modules/external-mcp/controllers/external-mcp-tasks.controller.ts). |
| Standalone MCP tools | **Partial** | The adapter currently advertises and dispatches `list_tasks` and `update_task_status` in [mcp.service.ts](apps/mcp-server/src/mcp/mcp.service.ts). The API has more operations than the adapter exposes. The dispatcher does not show the normal MCP initialization/session/capability lifecycle and no official MCP SDK dependency is present in `package.json`. |
| Lambda streaming adapter | **Partial** | A `streamifyResponse` handler, SSE-style output, cached Nest context, and [local simulator](apps/mcp-server/src/simulate-lambda.ts) exist. Event-shape assumptions, error semantics, connection behavior, and compatibility with the chosen production MCP transport remain unverified. |
| Authentication for token management | **Partial / security blocker** | The API auth controller has `@UseGuards(IsAuth)` commented out and the token-issuance path uses a hard-coded fake user ID. The standalone MCP auth controller also has its guard commented out and relies on `AuthContext` without showing an active guard. See [API auth controller](apps/api-server/src/modules/external-mcp/controllers/external-mcp-auth.controller.ts) and [standalone auth controller](apps/mcp-server/src/auth/auth.controller.ts). |
| AWS deployment of the MCP server | **Missing** | The MCP Dockerfile exists, but no MCP-specific AWS resource definitions or deployment workflow is present. Existing AWS workflows target the general server and cron stacks. |
| Tests | **Implemented as files; Not locally verified** | MCP-related unit-test files exist for the API guard/auth/tasks services and the standalone tasks adapter. Their execution, compilation, coverage, and integration behavior cannot be claimed from this checkout. |
| Production operations | **Missing** | There is no MCP-specific monitoring dashboard/alerting, rate-limit policy beyond the API controller’s source annotation, operational runbook, deployment rollback procedure, or end-to-end production smoke test in this repository. |

## Important gaps and risks

### P0 security issues

- The API token-management controller’s active issue route assigns every new token to a hard-coded fake user. Its Auth0 guard annotation is commented out. The test redirect route also returns a dummy token-like value and should not exist in a production route set.
- The standalone MCP auth controller has the same commented-out guard pattern. `@AuthContext()` is not an authentication mechanism by itself; the route must be protected by a real guard and the authenticated user must be used consistently.
- The source contains a hard-coded MCP credential in an alternate handler and uses a fixed development secret fallback for the internal service key. The API URL also has development fallbacks. Treat any credential that has existed in source or deployed configuration as exposed: rotate it, remove it from code, and fail closed when required configuration is absent. No actual secret value is reproduced in this report.
- The Lambda handler sends `Access-Control-Allow-Origin: *` and comments that it should be adjusted. CORS, origin policy, request size limits, and abuse controls need an explicit production decision.

### MCP protocol and transport risks

- The implementation manually switches on `tools/list` and `tools/call`; it does not visibly implement protocol initialization, negotiated capabilities, session handling, notifications, or a complete error/transport contract.
- The source contains an older commented SSE controller and multiple alternate handlers. This makes it unclear whether the intended production boundary is API Gateway, ALB, or Lambda Function URL, and whether the client expects request/response HTTP, SSE, or another MCP transport.
- The Lambda path forwards the caller’s bearer token to the API, but the internal service key is separately hard-coded/fallback-based. This trust boundary needs explicit secret management, rotation, least-privilege access, and replay/rate-limit decisions.

### Delivery and maintenance risks

- Existing AWS workflows deploy the general API and cron services only. A successful general API deployment would not demonstrate that the MCP Lambda image or its endpoint was deployed.
- Resolved (Task 14): the recovery/duplicate paths that previously created uncertainty about ownership and source of truth — `external-mcp_fffff`, `main222.ts`, `mcp.controller---fefef.ts`, and `mcp.service.--fefefefts` — have been removed. `external-mcp_fffff` was merged into [`external-mcp`](apps/api-server/src/modules/external-mcp).
- Committed generated output in [`dist-mcp`](dist-mcp) can conceal whether a change came from current TypeScript source or a stale build artifact. The team should establish a clean source/build policy before productionizing the adapter.
- The local MCP tasks test file appears to contain copied API-service test imports and should be reviewed as part of the test cleanup; its presence is not evidence that the standalone adapter is testable or passing.

## What could not be verified locally

`node_modules` is absent in this checkout. Therefore the following were not run and must be treated as **Not locally verified**:

- TypeScript/Nest compilation or `npm run build` for either the API or MCP application.
- Unit tests, coverage, linting, migrations, or the local Lambda simulator.
- Docker image build or Lambda container startup.
- Connectivity to a real API, database, AWS account, ECR repository, CloudFormation stack, ALB/API Gateway/Function URL, or secret store.
- Whether the current source matches any deployed artifact or external infrastructure repository.

The CI workflow does install dependencies and run general build/test jobs, but that is workflow configuration, not evidence that this checkout’s MCP path currently passes.

## Git history: what the last interns/agents did

This is a history-based summary, not a claim that every change is currently deployable.

1. **5 March 2026:** The repository added the OpenClaw/MCP task-access plan ([issue 1719 plan](plans/issue-1719-mcp-server-tasks.md)), describing scoped tokens, task tools, and a separate MCP server.
2. **6 March 2026:** The MCP integration was refactored to be generic (`1c72303d`), following the initial planning commits.
3. **7 March 2026:** MCP agent-task backend work was approved and committed (`6d67aeec`, “MCP Agent Task Integration Backend”), covering agent names, task assignment, filtering, notes/status handling, and project statuses.
4. **19 May 2026:** The current line culminated in recovery-style commits, including `0c6a5ea0` (“Add all recovered project files”). The recovered tree includes the standalone Lambda prototype, alternate files, and committed `dist-mcp` output.

## Prioritized worklist

### P0 — secure the existing boundary before exposing it

- Replace the fake user path with the authenticated Auth0 user and enable/verify guards on every token-management and agent-management route.
- Remove test/deeplink routes and all hard-coded credentials or insecure fallbacks; rotate any affected credentials and require secrets/configuration at startup.
- Add authorization tests proving users cannot issue, list, revoke, or assign tokens across accounts, and agents cannot read or mutate tasks outside their token assignment.

### P1 — choose and implement one production MCP transport

- Record an architecture decision for API Gateway, ALB, or Lambda Function URL, including streaming/session requirements, authentication, CORS, timeouts, request limits, and client compatibility.
- Replace the hand-written protocol shim, or explicitly complete and test it against the MCP protocol contract. Expose the intended task tools consistently, including detail, notes, status, and project-status operations where required.

### P1 — make the MCP deployment real and repeatable

- Add the MCP-specific container build, ECR repository/image tagging, Lambda resource, IAM role/policies, networking, secret injection, endpoint mapping, and environment configuration to the owning infrastructure repository or this repository.
- Add CI/CD deployment and rollback steps that build the MCP image and run an authenticated protocol smoke test against the deployed endpoint.

### P1 — establish one canonical source tree

- Resolved (Task 14): `external-mcp_fffff` merged into `external-mcp`; `main222.ts` and the alternate controller/service files removed; confirmed one active entry point (`main.ts` → `McpService.handleStreamRequest`), and removed the dead, unused `handleStreamRequest1111111` method from `mcp.service.ts`. Still open, separate from Task 14: committed `dist-mcp` build output is still tracked in git (`.gitignore` only excludes `/dist`, not `dist-mcp`) and should be removed from version control.
- Reconcile the standalone MCP tests with the actual standalone services and add integration tests against a test API/database.

### P1 — verify behavior end to end

- Test token issuance, hashing, expiry, revocation, scopes, assignment filtering, task detail, status transitions, notes, and project-status idempotency.
- Test MCP initialization, tool discovery, tool calls, malformed requests, missing/expired/revoked tokens, upstream API failures, retries, streaming completion, and cold/warm Lambda invocations.

### P2 — operate and document the service

- Add structured MCP request logs, metrics, tracing, alarms, rate limiting, audit events, and a runbook for incident response and rollback.
- Document frontend/token-management usage, token rotation, agent assignment, endpoint configuration, and the ownership boundary between this repository and external AWS infrastructure.

## Recommended starting point

Start with the P0 security fixes and credential rotation. Once the API boundary is safe, write the P1 transport/AWS architecture decision and use it to define one canonical MCP entry point. The first meaningful acceptance test should then be a deployed, authenticated `initialize` → tool discovery → assigned-task read/update flow, with a negative authorization case and a rollback path.
