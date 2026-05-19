# Deploying to Azure Container Apps

Step-by-step guide to deploy the mfr® MCP server to Azure Container Apps at `mcp.simplias.com` (or whatever subdomain you pick).

## Prerequisites

- Azure subscription
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and logged in (`az login`)
- A domain you own (DNS will need to point at the Container App)

## One-time setup

### 1. Generate the master encryption key

```bash
npm install
node scripts/generate-key.js
# → prints something like: 4f3b...e2a1
```

**Save this somewhere safe.** Rotating this key will force every customer to re-click "Connect" in their AI client.

### 2. Create the Azure resources

```bash
# Variables — adjust as needed
RG=mfr-mcp
LOCATION=germanywestcentral      # Frankfurt — best for EU/GDPR
ENV=mfr-mcp-env
APP=mfr-mcp
KV=mfr-mcp-kv-$RANDOM             # globally unique
TOKEN_KEY=<paste-the-key-from-step-1>

# Resource group
az group create --name $RG --location $LOCATION

# Key Vault to hold MFR_TOKEN_KEY
az keyvault create --name $KV --resource-group $RG --location $LOCATION
az keyvault secret set --vault-name $KV --name mfr-token-key --value "$TOKEN_KEY"

# Container Apps environment
az containerapp env create \
  --name $ENV \
  --resource-group $RG \
  --location $LOCATION
```

### 3. Deploy the container

From the repo root:

```bash
az containerapp up \
  --name $APP \
  --resource-group $RG \
  --environment $ENV \
  --source . \
  --ingress external \
  --target-port 8080 \
  --env-vars \
    MFR_TOKEN_KEY=secretref:token-key \
    PUBLIC_URL=https://mcp.simplias.com
```

Azure builds the image from the Dockerfile, pushes it to a managed registry, and deploys it. First run takes ~3 minutes.

When done it prints a URL like:
```
https://mfr-mcp.bluestone-abc123.germanywestcentral.azurecontainerapps.io
```

Test it:

```bash
curl https://<that-url>/healthz
# → {"ok":true,"service":"mfr-mcp","version":"3.0.0"}
```

### 4. Wire up secret reference to Key Vault

```bash
# Grant the Container App access to the Key Vault
APP_IDENTITY=$(az containerapp identity assign --name $APP --resource-group $RG --system-assigned --query principalId -o tsv)
az keyvault set-policy --name $KV --object-id $APP_IDENTITY --secret-permissions get

# Reference the Key Vault secret
KV_URI=$(az keyvault secret show --vault-name $KV --name mfr-token-key --query id -o tsv)
az containerapp secret set --name $APP --resource-group $RG \
  --secrets token-key=keyvaultref:$KV_URI,identityref:system
```

### 5. Add your custom domain

```bash
# Get the Container App's verification ID
VERIF_ID=$(az containerapp show --name $APP --resource-group $RG --query "properties.customDomainVerificationId" -o tsv)

echo "Add this DNS TXT record to your domain (one-time):"
echo "   asuid.mcp     TXT    $VERIF_ID"
echo ""
echo "Then add a CNAME:"
echo "   mcp           CNAME  $APP.<environment-id>.${LOCATION}.azurecontainerapps.io"
```

Add both DNS records in your domain provider (Cloudflare, Namecheap, etc.). Wait ~5 minutes for propagation, then:

```bash
# Bind the hostname + auto-provision SSL certificate
az containerapp hostname bind \
  --name $APP \
  --resource-group $RG \
  --hostname mcp.simplias.com \
  --environment $ENV \
  --validation-method CNAME
```

Now `https://mcp.simplias.com` serves your MCP server with a free Azure-managed SSL cert.

### 6. Verify the OAuth discovery endpoint

```bash
curl https://mcp.simplias.com/.well-known/oauth-authorization-server | jq
```

Should return JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, etc.

## Updating

After code changes, re-run:

```bash
az containerapp up \
  --name $APP \
  --resource-group $RG \
  --source .
```

Azure rebuilds and rolls out with zero downtime.

## Logs

```bash
az containerapp logs show --name $APP --resource-group $RG --follow
```

## Cost

Container Apps charges per request + per active second. For a small MCP server with bursty traffic:

- **Idle** (no requests): €0 — scales to zero
- **Light use** (a few customers, dozens of requests/day): under €5/month
- **Heavy use** (hundreds of active sessions): €15-50/month

Set a budget alert in the Azure portal under **Cost Management** to avoid surprises.

## Rotating the master key

If `MFR_TOKEN_KEY` is ever compromised:

```bash
NEW_KEY=$(node scripts/generate-key.js)
az keyvault secret set --vault-name $KV --name mfr-token-key --value "$NEW_KEY"
az containerapp revision restart --name $APP --resource-group $RG
```

All existing customer tokens immediately become invalid. Customers will click "Connect" again in Claude and re-enter their mfr® credentials.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `MFR_TOKEN_KEY environment variable is not set` | Container is missing the env var — check the Key Vault secret reference is wired (step 4). |
| OAuth client sees `invalid redirect_uri` | The customer's AI client registered a redirect URI we don't allow. Check Container App logs for the specific URI; it must come from the customer's MCP client. |
| `Cannot reach mfr®` during login | Outbound network issue from Azure → mfr® portal. Check firewall rules, mfr® IP allowlist if any. |
| HTTP 502 from `mcp.simplias.com` | Container probably crashed on startup. Check logs: `az containerapp logs show ... --follow`. |
