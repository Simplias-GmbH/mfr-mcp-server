# mfr® MCP Server

Remote + local MCP (Model Context Protocol) server for the **mfr® (Mobile Field Report)** API.

Lets AI assistants (Claude Desktop, Cursor, ChatGPT agents, n8n, etc.) call mfr® on behalf of a user — read service requests, create appointments, generate reports, and more.

## Two modes

| Mode | Who it's for | How customers authenticate |
|---|---|---|
| **stdio** | Developers / power users running locally | `MFR_USERNAME` + `MFR_PASSWORD` env vars |
| **http** | Production deployment — your customers | OAuth 2.1 "Connect" button + login page; each customer uses their own mfr® account |

Default mode is **stdio**. Set `MFR_MODE=http` (or pass `--http`) for HTTP mode.

## Architecture (HTTP mode)

```
Customer's Claude  ──► your MCP server (Azure / Mac / Hetzner)  ──► mfr® API
                       ▲
                       │ OAuth 2.1 with stateless sealed tokens
                       │ — no database, no stored credentials
                       │ — every request unseals creds in memory,
                       │   calls mfr® with Basic Auth, discards
```

**Zero stored credentials.** Customer mfr® username + password are AES-256-GCM-encrypted into the OAuth token and held by the customer's AI client. The server only stores the master encryption key.

See [authentication flow details](#authentication-flow) below.

## Quick start (local dev)

```bash
git clone <this repo>
cd mfr-mcp-server
npm install

# Generate the master encryption key (HTTP mode only)
npm run generate-key
# → 64-hex-char output. Save it.

# Create .env
cp .env.example .env
# edit .env: set MFR_TOKEN_KEY and PUBLIC_URL

# Run in HTTP mode (production simulation)
npm run start:http
# → http://localhost:8080

# Or run in stdio mode (single-user, for Claude Desktop config)
export MFR_USERNAME=...
export MFR_PASSWORD=...
npm run start:stdio
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full Azure Container Apps walkthrough.

For your customers' setup instructions, see [CUSTOMER_SETUP.md](CUSTOMER_SETUP.md).

## Tools

39 mfr® tools across READ and WRITE. See [src/mfr/tools.js](src/mfr/tools.js) for the full schema.

| Category | Tools |
|---|---|
| **Read** | service_requests, service_objects, companies, contacts, appointments, users, documents, time_events, tags, webhooks, items, steps, step_list_templates, item_types, cost_centers, offers, invoices, projects |
| **Write** | create/update company, contact, service_object; create/update/delete service_request, item; create/update appointment, offer, project; create/delete webhook; generate_report |

## Authentication flow

When a customer connects in their AI client:

1. **Discovery** — Claude reads `/.well-known/oauth-authorization-server`.
2. **Client registration** — Claude POSTs to `/register`. Server returns a sealed `client_id`.
3. **Authorize (GET)** — browser opens `/authorize?...`. Server renders [a login form](src/views/login.html).
4. **Login submit (POST)** — server validates the credentials against mfr® API. If valid, it AES-256-GCM-encrypts `{username, password, ...}` into an **authorization code**, redirects browser back to Claude.
5. **Token exchange** — Claude POSTs to `/token` with the code + PKCE verifier. Server re-validates PKCE, returns the same encrypted blob as an **access token** + **refresh token**.
6. **Tool calls** — every MCP request carries `Authorization: Bearer <sealed token>`. Server unseals on the fly, calls mfr® with Basic Auth, discards credentials.

The server is **stateless** — no database, no session store, no customer table. Only the master key (`MFR_TOKEN_KEY`) is stored on the server.

See [src/oauth/provider.js](src/oauth/provider.js) and [src/crypto/token-seal.js](src/crypto/token-seal.js).

## Environment variables

| Var | Required | Default | What |
|---|---|---|---|
| `MFR_MODE` | — | `stdio` | `stdio` or `http` |
| `MFR_BASE_URL` | — | mfr® prod | Override for testing |
| **HTTP mode** | | | |
| `MFR_TOKEN_KEY` | ✅ | — | 64-hex-char AES-256 key. Generate with `npm run generate-key`. |
| `PUBLIC_URL` | ✅ | — | The public URL where the server is reachable, e.g. `https://mcp.simplias.com` |
| `PORT` | — | `8080` | Listen port |
| `HOST` | — | `0.0.0.0` | Listen host |
| **stdio mode** | | | |
| `MFR_USERNAME` | ✅ | — | mfr® user |
| `MFR_PASSWORD` | ✅ | — | mfr® password |

## File layout

```
.
├── index.js                   ← entry point — dispatches stdio or http
├── src/
│   ├── mfr/
│   │   ├── client.js          ← mfrFetch + buildODataUrl (per-request creds)
│   │   └── tools.js           ← TOOLS array + handleTool dispatcher
│   ├── oauth/
│   │   └── provider.js        ← stateless OAuthServerProvider implementation
│   ├── crypto/
│   │   └── token-seal.js      ← AES-256-GCM seal/unseal
│   ├── views/
│   │   └── login.html         ← branded login form
│   └── http-server.js         ← Express app wiring everything
├── scripts/
│   └── generate-key.js        ← one-shot: print a fresh MFR_TOKEN_KEY
├── Dockerfile                 ← for Azure Container Apps / other Docker hosts
├── .env.example
├── DEPLOYMENT.md
└── CUSTOMER_SETUP.md
```

## License

MIT
