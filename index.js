#!/usr/bin/env node
/**
 * mfr® MCP Server — entry point.
 *
 * Two modes:
 *   • stdio (default)  — local mode: launched as a subprocess by Claude Desktop,
 *                        Cursor, n8n, etc. Credentials come from MFR_USERNAME /
 *                        MFR_PASSWORD env vars. This is for developers / power
 *                        users running the server locally.
 *
 *   • http             — remote mode: an HTTP server with OAuth 2.1.
 *                        Customers connect via Claude with a "Connect" button,
 *                        log in with their own mfr® credentials, and get a
 *                        per-customer encrypted bearer token. Credentials are
 *                        never stored — see src/oauth/provider.js.
 *
 * Select with:  MFR_MODE=http  (or pass --http on the CLI)
 * Default:      stdio
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS, handleTool } from './src/mfr/tools.js';

const mode = process.env.MFR_MODE
  || (process.argv.includes('--http') ? 'http' : 'stdio');

if (mode === 'http') {
  const { startServer } = await import('./src/http-server.js');
  await startServer();
} else {
  await runStdioMode();
}

async function runStdioMode() {
  const username = process.env.MFR_USERNAME;
  const password = process.env.MFR_PASSWORD;
  if (!username || !password) {
    console.error('Error: MFR_USERNAME and MFR_PASSWORD must be set in stdio mode.');
    process.exit(1);
  }
  const credentials = { username, password };

  const server = new Server(
    { name: 'mfr-mcp', version: '3.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
