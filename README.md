# mfr® MCP Server v1

Direkter Zugriff auf die Mobile Field Report API via MCP Tools.

## Setup

### 1. Dependencies installieren

```bash
cd ~/n8n/mcp/mfr-mcp
npm install
```

### 2. Credentials in `.mcp.json` eintragen

```json
"mfr-mcp": {
  "env": {
    "MFR_USERNAME": "<dein-mfr-benutzername>",
    "MFR_PASSWORD": "<dein-mfr-passwort>"
  }
}
```

### 3. Claude Code neu starten

MCP Server wird beim Start geladen.

### 4. Test

```
mfr_get_service_requests mit top=3
```

## Tools (v1)

| Tool | Beschreibung |
|------|-------------|
| `mfr_get_service_requests` | Aufträge lesen ($filter, $expand, $top, $orderby) |
| `mfr_get_companies` | Firmen lesen ($filter, $search, $expand) |
| `mfr_get_contacts` | Kontakte lesen |
| `mfr_get_appointments` | Termine lesen |
| `mfr_get_webhooks` | Webhooks anzeigen |
| `mfr_create_service_request` | Neuen Auftrag anlegen |
| `mfr_update_service_request` | Auftrag aktualisieren |
| `mfr_create_appointment` | Termin anlegen |

## Umgebungsvariablen

| Variable | Pflicht | Default |
|----------|---------|---------|
| `MFR_BASE_URL` | Nein | `https://portal.mobilefieldreport.com` |
| `MFR_USERNAME` | Ja | — |
| `MFR_PASSWORD` | Ja | — |
