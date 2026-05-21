/**
 * mfr® remote MCP server — HTTP transport with OAuth 2.1.
 *
 * Wires together:
 *   • the SDK's mcpAuthRouter (OAuth endpoints + discovery metadata)
 *   • our stateless OAuthServerProvider (provider.js)
 *   • the SDK's requireBearerAuth middleware
 *   • the SDK's StreamableHTTPServerTransport for the actual MCP endpoint
 *
 * The customer's mfr® credentials, decrypted from the bearer token by the
 * provider, ride along on `req.auth.extra.credentials` and are handed to
 * the tool dispatcher per-request.
 */

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

import { provider } from './oauth/provider.js';
import { TOOLS, handleTool } from './mfr/tools.js';

const PUBLIC_URL = process.env.PUBLIC_URL;
if (!PUBLIC_URL) {
  throw new Error('PUBLIC_URL is required (e.g. https://mcp.simplias.com)');
}

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const issuerUrl = new URL(PUBLIC_URL);

// ────────────────────────────────────────────────────────────────────────────
// Build a fresh MCP server for each request (stateless).
// ────────────────────────────────────────────────────────────────────────────

function buildMcpServer() {
  const server = new Server(
    { name: 'mfr-mcp', version: '3.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const credentials = extra?.authInfo?.extra?.credentials;
    if (!credentials) {
      return {
        content: [{ type: 'text', text: 'Error: no mfr® credentials in token. Please reconnect.' }],
        isError: true,
      };
    }
    const { name, arguments: args } = request.params;
    try {
      const result = await handleTool(name, args || {}, credentials);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ────────────────────────────────────────────────────────────────────────────
// Express app
// ────────────────────────────────────────────────────────────────────────────

export function buildApp() {
  const app = express();

  app.disable('x-powered-by');
  // Trust exactly one proxy hop — Azure Container Apps' envoy ingress.
  // Setting this to `true` would let any client spoof X-Forwarded-For and
  // bypass IP-based rate limiting on /authorize.
  app.set('trust proxy', 1);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'mfr-mcp', version: '3.0.0' });
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      'mfr® MCP server\n' +
      `\nConnect at:  ${PUBLIC_URL}/mcp\n` +
      `OAuth metadata:  ${PUBLIC_URL}/.well-known/oauth-authorization-server\n`
    );
  });

  // OAuth endpoints: /authorize, /token, /register, /revoke,
  //                  /.well-known/oauth-authorization-server,
  //                  /.well-known/oauth-protected-resource
  app.use(mcpAuthRouter({
    provider,
    issuerUrl,
    baseUrl: issuerUrl,
    resourceServerUrl: new URL('/mcp', issuerUrl),
    resourceName: 'mfr® MCP server',
  }));

  // MCP endpoint, JSON body parsed for us.
  const mcpJsonParser = express.json({ limit: '4mb' });
  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: new URL('/.well-known/oauth-protected-resource/mcp', issuerUrl).href,
  });

  app.post('/mcp', mcpJsonParser, bearer, async (req, res) => {
    try {
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[/mcp] handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Some clients send GET/DELETE for session management — stateless mode
  // doesn't use these, but respond cleanly rather than 404.
  app.all('/mcp', (req, res) => {
    if (req.method === 'POST') return;
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless mode: POST only)' },
      id: null,
    });
  });

  return app;
}

export function startServer() {
  const app = buildApp();
  return new Promise((resolve) => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`mfr® MCP server listening on http://${HOST}:${PORT}`);
      console.log(`Public URL:  ${PUBLIC_URL}`);
      resolve(server);
    });
  });
}
