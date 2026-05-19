# Connecting Claude to mfr®

This is what to send your customers when they want to use mfr® through Claude.

---

## What this gives you

After connecting, you can ask Claude things like:

- *"Show me all open service requests from last week"*
- *"Create a new appointment for service request 67167551495 on Friday at 10am"*
- *"What's the budget status of project ACME-2026?"*
- *"Generate a report for service request 67167551495"*

Claude handles the API calls — you stay in plain language.

## Setup (Claude Desktop)

### 1. Open Claude Desktop settings

`Claude` → `Settings` → `Integrations` → `Add MCP Server`.

### 2. Paste the server URL

```
https://mcp.simplias.com
```

Claude will detect that authentication is required and open a browser window.

### 3. Log in with your mfr® account

You'll see a login page asking for your **mfr® username and password** — the same credentials you use at [portal.mobilefieldreport.com](https://portal.mobilefieldreport.com).

Click **Connect**. The browser closes automatically and Claude shows:

> ✓ Connected to mfr®

### 4. Start using it

Open a new conversation and ask Claude about your mfr® data. It will use the connection on demand.

---

## Setup (Cursor, Continue, other MCP clients)

Most MCP-aware AI clients support remote MCP servers with OAuth. The flow is the same:

1. Find the "Add MCP server" / "Connect external tool" option.
2. Paste `https://mcp.simplias.com`.
3. Complete the OAuth flow in the browser.

---

## Privacy & security

**Your mfr® credentials are never stored on our servers.**

- When you log in, your password is **validated** by making one test call to mfr®.
- It's then **AES-256-GCM encrypted** into a token that's held **only by your Claude client**.
- Every time Claude uses an mfr® tool, our server briefly decrypts the token in memory, calls mfr®, and discards the credentials.
- We have **no database** of customers or credentials.

If you want to disconnect, remove the server in your AI client's MCP settings — your token is destroyed locally. No further action needed on our side.

## Permissions

The MCP server can do anything **your mfr® account** can do — no more, no less. If you have read-only access in mfr®, the AI assistant inherits that. To give someone limited access via AI, create a limited mfr® user for them and use those credentials.

## Troubleshooting

| Problem | Solution |
|---|---|
| Login page says "incorrect username or password" | Same as the portal — double-check you can sign in at portal.mobilefieldreport.com first. |
| Claude says "✓ Connected" but tools fail with 401 | Your token may have expired (24h lifetime). In Claude, remove the integration and add it again. |
| Claude can't find the tools | Restart Claude Desktop after connecting. |
| Some tools return 403 | Your mfr® account doesn't have permission for that operation. Ask your mfr® administrator. |

## Support

Email: aymen.chayeb@simplias.com
