# mfr® + Claude: Live Demo Script

**Audience:** Team members, prospective customers, or stakeholders
**Duration:** ~10 minutes
**What they'll see:** A real customer's first-time setup, then real mfr® data flowing into Claude.

---

## Setup before the demo

1. Run the reset commands (see [CUSTOMER_SETUP.md](CUSTOMER_SETUP.md) troubleshooting section)
2. Have Claude Desktop installed but with NO mfr connectors
3. Have the config file path ready to open
4. Have your real mfr® credentials ready (or create a demo account)
5. Two windows open and visible:
   - Claude Desktop
   - A text editor / VS Code on the Claude config file
6. (Optional) A browser tab on Azure Portal showing the Container App — for the architecture section

---

## Part 1 — "The problem" (1 minute)

Open with the business case:

> *"Today, when you want to know what's happening in mfr® — open service requests, technician schedules, customer histories — you have to log into the portal, navigate menus, write OData queries, or build custom integrations. Even with the API, it takes effort.*
>
> *We're going to change that. After this demo, you'll be able to ask any AI assistant — Claude, Cursor, ChatGPT — in plain language, and it'll just answer using your mfr® data."*

---

## Part 2 — Live customer setup (3 minutes)

This is the "anyone can do this" moment. Walk through it without explanation first, just show how fast it is.

### Action 1: Show the empty config

Open the Claude Desktop config file in the text editor. Show: empty `mcpServers` or no `mcpServers` block at all.

> *"This is what every customer's machine looks like before they connect. Nothing mfr-specific."*

### Action 2: Paste the connector

Paste this **on Windows**:

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

(For Mac demos, use `"command": "npx"` without the full path.)

Save the file.

> *"That's literally all the configuration. One URL. We send this snippet to every customer — no API keys, no setup wizard, no install."*

### Action 3: Trigger the login (make sure the audience SEES the form)

**Don't just restart Claude and hope the browser tab is visible.** Instead, in PowerShell:

```powershell
& "C:\Program Files\nodejs\npx.cmd" -y mcp-remote https://mfr-mcp.delightfulsky-06abcb55.northeurope.azurecontainerapps.io/mcp
```

(This runs exactly what Claude Desktop runs internally. Doing it manually gives you control over timing.)

PowerShell prints output and your default browser opens. Switch to the browser and **show the login form**:

> *"This is the login page our customers see. Notice three things:*
> - *It's hosted by us — our domain in the URL bar.*
> - *It's asking for their **existing** mfr® credentials. No new password, no separate API user.*
> - *Look at the bottom — 'Your credentials are never stored on our servers. They're encrypted into a token that only your AI client holds.' That's not marketing — it's how it actually works, and we'll see why in a minute."*

**Pause here for ~10 seconds.** Let the audience read the form. Point to the message at the bottom.

### Action 4: Log in

Type your mfr® username and password → click **Connect**.

Browser shows "You can close this window." PowerShell shows `Authentication successful`.

> *"5 seconds. The customer's credentials touched our server's memory for one HTTP call to validate them against mfr® — then they were encrypted into a token and discarded. We have no database, no logs of credentials. Now this customer's Claude is permanently connected."*

Hit **Ctrl+C** in PowerShell to stop the manual mcp-remote — Claude Desktop will spawn its own. Then restart Claude Desktop:

```powershell
Get-Process claude -ErrorAction SilentlyContinue | Stop-Process -Force
```

Reopen from Start menu. Claude picks up the cached token at `~/.mcp-auth/` — no second login needed.

### Action 5: First tool call

Go to Claude Desktop, open a new conversation, type:

> *"Show me 3 of my customers from mfr®"*

When the permission prompt appears, accept. Real data shows up.

> *"Real customer data. Not from a cache, not a demo dataset — that just came live from production mfr®, authenticated with my account."*

Try one more:

> *"Are any service requests open right now? Group them by customer."*

> *"Notice Claude is interpreting my question, picking the right tools, formatting the answer. The customer never wrote OData, never thought about endpoints."*

---

## Part 3 — How it works (4 minutes)

Now the technical "how" — keep it visual.

### The architecture (1 minute)

Draw or screen-share this:

```
   Customer's Claude                      Your Azure Server                      mfr® API
        │                                       │                                  │
        │  1. "Connect to mfr"                  │                                  │
        │ ────────────────────────────────────► │                                  │
        │ ◄──────── login page (HTML) ──────────│                                  │
        │                                       │                                  │
        │  2. Submit username + password        │                                  │
        │ ────────────────────────────────────► │                                  │
        │                                       │ ─── validate (1 call) ─────────► │
        │                                       │ ◄────────────── 200 OK ──────────│
        │                                       │                                  │
        │  3. Encrypted token                   │                                  │
        │ ◄─────────────────────────────────────│                                  │
        │                                       │                                  │
        │     [token sits in Claude's keychain] │                                  │
        │                                       │                                  │
        │  4. Every tool call:                  │                                  │
        │     Authorization: Bearer <token>     │                                  │
        │ ────────────────────────────────────► │                                  │
        │                                       │ decrypts token in RAM,           │
        │                                       │ extracts {user, pass}            │
        │                                       │                                  │
        │                                       │ ─── call mfr (Basic Auth) ─────► │
        │                                       │ ◄──────── data ──────────────────│
        │                                       │                                  │
        │                                       │ discards credentials             │
        │ ◄──────── data ───────────────────────│                                  │
```

> *"Three actors. Customer's machine, our server, mfr® itself. Notice: the customer's password lives encrypted in their own Claude Desktop. Our server is just a stateless translator."*

### What we DON'T store (1 minute)

> *"Let's talk about what we explicitly chose NOT to do.*
>
> *We don't have a customer database. We don't store mfr® credentials. We don't keep tokens. We don't log API content. If our server gets compromised tomorrow, the attacker gets... one encryption key.*
>
> *No customer data was at rest. There's nothing to steal."*

(Optional: open [src/oauth/provider.js](src/oauth/provider.js) and show the seal/unseal functions are tiny — 40 lines.)

### Live: show the server-side validation (1 minute)

Open Azure Portal → Container App → Monitoring → Log stream.

> *"Here's our production server. Watch the logs."*

Go back to Claude. Ask:

> *"Use mfr to count my service requests"*

Logs show the request hitting Azure, the mfr® call being made, the response coming back. **Quote a log line.**

> *"That's a customer using their AI assistant, that's our server brokering the call, that's mfr® responding. Live."*

### Security review pitch (1 minute)

> *"For your security team or compliance team — we use OAuth 2.1 (RFC 6749, the industry standard). AES-256-GCM encryption. PKCE for code interception protection. EU data residency in Microsoft Azure Frankfurt. GDPR-aligned by design — we're a transient processor, not a controller of credentials.*
>
> *Full technical details in [CUSTOMER_SETUP.md](CUSTOMER_SETUP.md)."*

---

## Part 4 — What's next (2 minutes)

End with the takeaway and a call to action.

### Use cases that just work today

Show them practical prompts to think about:

- *"Email customers whose service requests have been open >2 weeks"* (combine with Gmail MCP)
- *"What's our technician utilization this month?"*
- *"Find all invoices over €10,000 due this week"*
- *"Draft a status report for project ACME"*

> *"These are all natural-language workflows. Today they'd take you 20 minutes of clicking. With this, 10 seconds."*

### Other AI clients work too

> *"This isn't a Claude-only thing. Same URL works in Cursor, n8n, custom MCP clients, anything that supports OAuth 2.1. We're betting on the standard, not on one vendor."*

### Call to action

Tailor for the audience:

- **For internal team:** *"Who wants early access? Sign up, we'll get you connected next week."*
- **For customers/prospects:** *"We can have you live in 5 minutes. The setup guide is at [link]. Or send your IT team to [aymen.chayeb@simplias.com](mailto:aymen.chayeb@simplias.com)."*
- **For management:** *"This positions Simplias as the first mfr® integrator with native AI support. Want to discuss rollout?"*

---

## Backup material (if asked)

| Question | Answer |
|---|---|
| "What if mfr® changes their API?" | Our server is a thin wrapper. API changes mean editing one file (`src/mfr/tools.js`) and redeploying. Customer setup doesn't change. |
| "What about multi-user companies?" | Each user connects with their own mfr® credentials. Permissions inherit per-user. |
| "What does it cost to run?" | Azure Container Apps scales to zero — under €5/month at light load. Customer pays nothing extra; this is part of their mfr® integration package. |
| "Can it write data too, not just read?" | Yes. 39 tools, ~20 of them write operations (create appointments, update service requests, generate reports). |
| "What if a customer's password changes?" | They get prompted to reconnect — takes 10 seconds. |
| "Is this proprietary or open?" | It's an MCP server (open protocol). Our implementation can stay closed-source; the protocol is open so customers know they're not locked in. |

---

## Pre-demo checklist

- [ ] Reset done (no mcpServers in config, no `.mcp-auth` cache)
- [ ] Claude Desktop opens to a clean state
- [ ] Real mfr® credentials handy (use a demo account if presenting publicly)
- [ ] Network connection good (you'll be hitting Azure live)
- [ ] Azure Portal log stream open in a tab (for Part 3)
- [ ] Audience can see your screen clearly (font size up if needed)
- [ ] Backup: have a screenshot of working tools in case live demo fails
