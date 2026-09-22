# MCP developer starting guide

This is the recommended order for making the MCP implementation safe, testable, and deployable. The most important instruction is: **do not deploy the current Lambda prototype first**. Secure the API boundary before exposing it through AWS.

The current repository assessment is documented in [MCP_CODEBASE_STATUS.md](MCP_CODEBASE_STATUS.md).

## The first milestone

Do not move to AWS deployment until this flow works:

```text
Authenticated user issues a scoped token
        -> MCP client completes initialize
        -> MCP client discovers tools
        -> MCP client reads and updates only assigned tasks
        -> unauthorized access is rejected
```

## Step 1: create a branch and establish a baseline

From the repository root:

```bash
git status --short --branch
git switch -c mcp/p0-secure-auth
npm ci
node --version
npm --version
npm test -- --runInBand
npx nest build api-server
npx nest build mcp-server
```

The root `npm run build` does not build the MCP application, so the API and MCP builds must be checked separately. If `npm ci` fails, record the Node/npm versions and the failure before changing project configuration.

## Step 2: fix authentication before touching AWS

Start in [external-mcp-auth.controller.ts](apps/api-server/src/modules/external-mcp_fffff/controllers/external-mcp-auth.controller.ts).

Make these changes:

1. Enable `@UseGuards(IsAuth)` at controller level.
2. Inject `@AuthContext()` into the token-issuance route.
3. Pass the authenticated `user.id` to `issueToken()`.
4. Remove the hard-coded fake user ID.
5. Remove the test redirect route.
6. Do not place raw tokens in redirect URLs.
7. Ensure token issue, list, revoke, and agent-management routes all require authentication.

Then review [apps/mcp-server/src/auth/auth.controller.ts](apps/mcp-server/src/auth/auth.controller.ts). Decide whether token management belongs only in the API. The preferred arrangement is for the API to be the canonical token-management owner, while the standalone MCP application only handles MCP requests.

## Step 3: remove credential risks

Review these files:

- [mcp.service.ts](apps/mcp-server/src/mcp/mcp.service.ts)
- [tasks.service.ts](apps/mcp-server/src/mcp/services/tasks.service.ts)
- [internal-service.guard.ts](apps/api-server/src/modules/external-mcp_fffff/guards/internal-service.guard.ts)

Required actions:

- Remove any credential literals from source, including alternate or unused handlers.
- Remove insecure development fallbacks for the internal service key and API URL in production.
- Load required secrets from the deployment secret manager.
- Fail closed at startup when required production configuration is absent.
- Rotate any credential that has previously been committed to source or deployed configuration.

Do not copy actual token or secret values into pull requests, documentation, test fixtures, or issue comments.

## Step 4: add and run authorization tests

Extend the existing tests under [apps/api-server/src/modules/external-mcp_fffff/guards](apps/api-server/src/modules/external-mcp_fffff/guards) and [apps/api-server/src/modules/external-mcp_fffff/services](apps/api-server/src/modules/external-mcp_fffff/services).

The tests must prove:

- An unauthenticated request receives `401`.
- User A cannot list or revoke User B's tokens.
- Expired and revoked tokens fail authentication.
- A token without `tasks:write` cannot update a task.
- An agent cannot read or mutate a task assigned to another MCP token.
- Token issuance records the authenticated user rather than a fixed identity.

Run the focused tests first, then the complete suite:

```bash
npx jest --runInBand \
  apps/api-server/src/modules/external-mcp_fffff/guards \
  apps/api-server/src/modules/external-mcp_fffff/services

npm test -- --runInBand
```

Do not proceed to deployment while these tests are failing or cannot compile.

## Step 5: choose one MCP protocol and transport

The current adapter is a hand-written dispatcher that visibly handles only `tools/list` and `tools/call`. It does not demonstrate the complete MCP initialization and session lifecycle.

Create a short architecture decision record that answers:

- Which MCP protocol version and official SDK version will be supported?
- Is the server stateless or stateful?
- Will the endpoint use Streamable HTTP, legacy HTTP+SSE, or another transport?
- Will AWS expose it through a Lambda Function URL or API Gateway?
- How are bearer tokens, CORS, rate limits, request sizes, and timeouts handled?
- Which team owns the AWS resources and the production rollback?

The recommended technical direction is the official MCP TypeScript SDK with Streamable HTTP for the remote server. The [MCP TypeScript SDK transport guidance](https://ts.sdk.modelcontextprotocol.io/server) recommends Streamable HTTP for remote servers and treats older HTTP+SSE as compatibility mode.

The existing Lambda handler uses AWS response streaming. AWS documents response streaming through Lambda Function URLs and API Gateway proxy integrations; the team must choose and configure one explicitly. See [AWS Lambda response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html).

## Step 6: implement the local MCP flow

Replace or complete the hand-written protocol shim. The minimum flow is:

```text
initialize
  -> notifications/initialized
  -> tools/list
  -> tools/call: list assigned tasks
  -> tools/call: update a permitted task
```

Expose the operations that the API already supports, as required by the product:

- List tasks.
- Read task detail.
- Update task status.
- Add task notes.
- Create or retrieve project statuses.

Preserve the caller's bearer token when forwarding requests to the API. Keep the internal service key separate from the caller token.

Run the local simulator after the protocol implementation is ready:

```bash
npm run simulate
```

Test both a valid assigned-task flow and a negative case where the token attempts to access another agent's task.

## Step 7: make the AWS deployment real

The AWS owner should add these resources in this repository or the owning infrastructure repository:

- MCP ECR repository.
- MCP image build and immutable image tags.
- Lambda function and execution role.
- Network access from Lambda to the API.
- Secret and environment-variable injection.
- Function URL or API Gateway endpoint.
- Custom domain, CORS, throttling, and request limits.
- CloudWatch logs, metrics, alarms, and rollback.
- Authenticated deployment smoke tests.

The existing production workflow deploys the general API and cron services. It does not prove that the MCP image or endpoint has been deployed. Add MCP-specific CI/CD rather than assuming the existing API workflow covers it.

The Lambda image should be built and tested explicitly:

```bash
docker build -f apps/mcp-server/Dockerfile.mcp -t focusbear-mcp:local .
```

Do not treat committed [`dist-mcp`](dist-mcp) output as the source of truth. The image must be reproducible from the TypeScript source.

## Step 8: clean up the source tree after behavior is verified

Do this in a separate cleanup change after the protocol and tests are working:

- Confirm the canonical implementation behind [external-mcp.module.ts](apps/api-server/src/modules/external-mcp/external-mcp.module.ts).
- Decide whether the recovery-style `external-mcp_fffff` directory should be renamed.
- Remove or archive [main222.ts](apps/mcp-server/src/main222.ts).
- Remove or archive [mcp.controller---fefef.ts](apps/mcp-server/src/mcp/mcp.controller---fefef.ts).
- Remove or archive alternate service files such as `mcp.service.--fefefefts`.
- Reconcile the standalone MCP test imports with the actual standalone services.
- Establish whether generated `dist-mcp` output is ignored and rebuilt in CI.

Do not delete or rename these files until references, tests, and deployment configuration have been checked.

## Suggested ownership

### API developer

Own authentication, token lifecycle, scopes, task assignment filtering, and API authorization tests.

### MCP developer

Own the official SDK integration, protocol lifecycle, tool definitions, token forwarding, local simulator, and MCP adapter tests.

### AWS/infrastructure developer

Own the transport decision, ECR/Lambda resources, secrets, endpoint, CI/CD, monitoring, smoke tests, and rollback.

### QA or integration owner

Own end-to-end tests covering initialization, tool discovery, valid task access, denied task access, revoked tokens, upstream failures, and cold/warm Lambda behavior.

## Definition of ready for production

The MCP server is not production-ready until all of the following are true:

- Token management uses the authenticated user and active guards.
- No credentials or unsafe production fallbacks remain in source.
- Token expiry, revocation, scopes, and assignment isolation have passing tests.
- The server completes the MCP initialization lifecycle.
- The selected transport works with the intended MCP client.
- The MCP image builds reproducibly from source.
- A real AWS endpoint is deployed by an MCP-specific workflow.
- An authenticated smoke test passes after deployment.
- Monitoring, rate limiting, incident response, and rollback are documented.
