const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createSplHttpHandler } = require('../../dist/spl/SplHttpServer');
const { AuthorizationError } = require('../../dist/spl/security/Authorization');
const { loadUnifiedServerConfig } = require('../../dist/config');

test('project endpoint authorizes before interpretation and stays unavailable without configuration', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-http-'));
  let calls = 0;
  const gateway = { async complete() { calls++; return { content: '{"selections":[],"unmatchedTerms":[],"ambiguities":[]}', requestedModel: 'test', responseModel: 'test' }; } };
  const config = { outputRoot: path.join(root, 'products'), releaseStateDirectory: path.join(root, 'releases'),
    secureStateDirectory: path.join(root, 'secure'), externalProjectStateDirectory: path.join(root, 'imports'),
    auditFilePath: path.join(root, 'audit.jsonl'), allowedOrigins: ['http://localhost:3000'],
    authorizer: { async authorize(request, projectId, action) {
      assert.equal(action, 'derivation:plan');
      if (!request.headers.authorization) throw new AuthorizationError(401, 'Missing token');
      if (request.headers.authorization === 'Bearer viewer') throw new AuthorizationError(403, 'Forbidden');
      return { projectId, userId: 'user', role: 'editor' };
    } }, llmGateway: gateway };
  async function run(config, callback) {
    const handler = createSplHttpHandler(config);
    const server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { await callback(server); }
    finally { handler.shutdown(); await new Promise(resolve => server.close(resolve)); }
  }
  async function post(server, token, body) {
    return new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST',
        path: '/api/spl/v1/projects/demo/configuration-assistant/interpret',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }, response => {
        let raw = ''; response.on('data', chunk => raw += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(raw) }));
      });
      request.on('error', reject); request.end(JSON.stringify(body));
    });
  }
  try {
    const body = { modelId: 'model', requirement: 'Enable F', context: { features: [{ id: 'f', name: 'F' }] } };
    await run(config, async server => {
      assert.equal((await post(server, undefined, body)).status, 401);
      assert.equal((await post(server, 'viewer', body)).status, 403);
      assert.equal((await post(server, 'editor', {})).status, 400);
      assert.equal(calls, 0);
      const result = await post(server, 'editor', body);
      assert.equal(result.status, 200);
      assert.equal(result.body.projectMembership, 'unverified');
      assert.equal(calls, 1);
    });
    await run({ ...config, llmGateway: undefined }, async server => {
      assert.equal((await post(server, 'editor', body)).status, 503);
    });
    assert.equal(fs.readFileSync(config.auditFilePath, 'utf8').includes('Enable F'), false);
    for (const environment of [{}, { SPL_CONFIGURATION_ASSISTANT_ENABLED: 'true' },
      { SPL_CONFIGURATION_ASSISTANT_ENABLED: 'true', SPL_DEEPSEEK_API_KEY: 'synthetic-key', SPL_DEEPSEEK_TIMEOUT_MS: 'bad' }]) {
      assert.equal(loadUnifiedServerConfig({ workspaceRoot: root, environment }).spl.configurationAssistant, undefined);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
