# Connect Claude to your mfr® account

Use mfr® through Claude in plain language — no learning the API, no clicks.

After setup, you can say things like:
- *"Show me last week's open service requests"*
- *"Create an appointment for service request 67167551495 on Friday at 10am"*
- *"What's the project budget status for ACME?"*
- *"Generate a report for service request 67167551495"*

Claude does the API calls for you using **your own mfr® account**.

---

## Setup (3 steps, ~5 minutes)

### 1. Install Claude Desktop

Download from **[claude.ai/download](https://claude.ai/download)** and sign in.

### 2. Add the mfr® server to your config

Open the config file in a text editor:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
*(if installed from Microsoft Store, it's instead at `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`)*

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

If the file doesn't exist, create it. Paste this content (replace any existing content):

#### Windows config

```json
{
  "mcpServers": {
    "mfr": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": [
        "-y",
        "mcp-remote",
        "https://mfr-mcp.delightfulsky-06abcb55.northeurope.azurecontainerapps.io/mcp"
      ]
    }
  }
}
```

#### Mac config

```json
{
  "mcpServers": {
    "mfr": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mfr-mcp.delightfulsky-06abcb55.northeurope.azurecontainerapps.io/mcp"
      ]
    }
  }
}
```

> Requires **Node.js 20+** installed on your machine ([download Node.js](https://nodejs.org/)). `npx` ships with Node.js.

Save the file.

### 3. Restart Claude Desktop and log in

1. **Fully quit** Claude Desktop (system tray → right-click Claude icon → **Quit**)
2. **Reopen** Claude Desktop
3. After ~10 seconds your browser opens automatically to the mfr® login page
4. Enter your **mfr® username and password** (the same ones you use at [portal.mobilefieldreport.com](https://portal.mobilefieldreport.com))
5. Click **Connect**
6. Browser shows "You can close this window"

Done. ✅

---

## Try it

Open a new conversation in Claude and try:

> Use mfr to show me 3 of my customers

> What service requests are open right now?

> Create an appointment tomorrow at 14:00 for service request 67167551495

Claude will ask permission the first time it uses each tool — click **Allow always** to skip future prompts.

---

## How authentication works

We use **OAuth 2.1** — the same standard Google, Microsoft, and other large platforms use.

**At login:** Your browser opens a login page hosted by us. You enter your mfr® username and password (the ones you use at portal.mobilefieldreport.com). We validate them against mfr® once, then encrypt them with AES-256-GCM into a token that's stored **only on your computer** by Claude Desktop.

**On every use:** When Claude needs to call mfr®, it sends the encrypted token to our server. We decrypt it in memory, make the API call on your behalf, and immediately discard your credentials. Nothing is logged or stored.

**What we store:** one server-side encryption key. No customer database, no credentials, no logs of your data.

**What you store:** the encrypted token, in Claude Desktop's local OS keychain. Uninstall Claude or remove the connector → the token is gone.

**Permissions:** the AI inherits exactly your mfr® account's permissions — no more, no less.

**Region:** the server is hosted in Microsoft Azure Germany (Frankfurt). Your data doesn't leave the EU.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser never opens for login | Look at Claude Desktop → Settings → Developer → click **View Logs** next to `mfr`. The OAuth URL is in there — copy it into a browser manually. |
| Login form says "Incorrect username or password" | Use the **same** credentials that work at [portal.mobilefieldreport.com](https://portal.mobilefieldreport.com). If portal login works but ours doesn't, your account may need API access enabled — contact your mfr® administrator. |
| Claude says "I don't have access to mfr® tools" | Fully quit and restart Claude Desktop. Tools are loaded at startup. |
| Yellow toast: "Could not attach to MCP server mfr" | Fully quit Claude Desktop and any lingering Node processes (`taskkill /f /im node.exe` on Windows). Then reopen Claude. |
| Tools work intermittently | Your token expires after 24 hours of inactivity. Re-login when prompted (browser opens automatically). |

---

## Other AI clients

Any MCP client that supports OAuth 2.1 Streamable HTTP works. Examples:

- **Cursor** — `Settings → MCP → Add server` → paste the URL
- **n8n** — use the MCP node with the URL
- **Custom MCP clients** — same URL, OAuth 2.1 flow

Server URL: `https://mfr-mcp.delightfulsky-06abcb55.northeurope.azurecontainerapps.io/mcp`

---

## Support

Email: **aymen.chayeb@simplias.com**
