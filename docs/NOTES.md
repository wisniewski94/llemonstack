# WIP Notes

This is just a scratchpad for WIP project notes to keep the main README clean.

## TODO

- [ ] Record video demo

- [ ] Modify init to auto gen LiteLLM virtual key
      https://docs.litellm.ai/docs/proxy/virtual_keys

- [ ] Configure n8n templates to use LiteLLM
- [ ] Configure Flowise to use LiteLLM
- [ ] Configure zep to use LiteLLM proxy

- [ ] Add models to config.litellm.yaml

  - [ ] Embedding model for Zep
  - [ ] Common models for OpenAI: gpt-4o, o3-mini, whisper, embedding, etc.
  - [ ] Common models for Anthropic: claude 3.7, etc.

- [ ] Update versions script to get app versions from running containers, when available
      `docker compose -p llemonstack ps`
      Then check the list of services_with_app_verions to see if any match.
      Then docker exec in the container.

- [ ] Patch n8n LangChain to auto config Langfuse

  See [OTEL](OTEL.md) and https://community.n8n.io/t/swap-smith-langchain-for-langfuse/47748/7

- [ ] Ceate custom n8n node to use Langfuse to get prompts

- [ ] Setup [OTEL observability](OTEL.md)

- [x] Add langfuse UI url to start output
- [x] Add LiteLLM UI url to start output
- [x] Add LiteLLM API url to start output
- [x] Configure LiteLLM to set UI_USERNAME and pass from .env
- [x] Configure LiteLLM to log to Langfuse
- [x] Configure LiteLLM to use redis as cache layer
- [x] Start services in parallel in start script
- [x] Add minio UI & API to start script: http://localhost:9091
- [x] Add Redis to the stack
- [x] Add Langfuse to the stack
- [x] Add LiteLLM to use as LLM proxy for all services
- [x] Switch n8n import to run command in existing container
- [x] Rebuild n8n examples with pre-configured credentials
- [x] Update the import script to replace all ${var} style strings with env
      vars before running import in the container
- [x] Switch to separate compose yml files & simplify process for adding new service
- [x] Show api endpoints for internal config on start
- [x] Create export script for n8n workflows to shared folder, use --decrypted flag
- [x] Always prep supabaseEnv before doing anything else
  - fixes issue with update script not pulling images
- [x] Convert to new runCommands API
- [x] Add [Browser-Use](https://github.com/browser-use/browser-use) to automate browsers
- [x] Rebuild browser-use image in update.ts script
- [x] Implement reset.ts script
- [x] Add n8n enabled/disabled support in .env and docker-compose.yml
- [x] Disable parallel starting of services, the output gets mangled
- [x] Re-enable parallel setupRepos
- [x] Get image version from `docker inspect` if not available in docker-compose.yml
- [x] Create a setup script to generate random passwords and JWT secrets
- [x] Update install instructions for deno

- [ ] Create main.ts script to handle the CLI args and help text

**Someday / low priority:**

- [ ] Create an install script that installs deno, docker, etc.
      See https://github.com/SigNoz/signoz/blob/main/deploy/install.sh as good example
- [ ] Configure LiteLLM to cache qdrant embeddings
      https://docs.litellm.ai/docs/proxy/config_settings
- [ ] Configure LiteLLM to use supabase for request logs:
      https://docs.litellm.ai/docs/observability/supabase_integration
- [ ] Switch to Open Router for LLM calls
- [ ] Add skyvern to automate browsers
- [ ] Update README with instructions on using the n8n-custom-ffmpeg image
- [ ] Switch to [execa](https://github.com/sindresorhus/execa) for running
      shell commands if needed on Windows
- [ ] Add log streaming
- [ ] Create script to populate the supabase and random key.env vars on first install
  - [ ] Use `openssl rand -base64 64` to generate a random key?
- [ ] Document how to use podman on mac to enable ollama GPU support

**Where to Promote:**

- [ ] Promote this stack
- https://thinktank.ottomator.ai/c/local-ai/18

<br />

## Running Commands on Service Containers

```bash
# Exec a shell in a container, eg. in n8n
# Uses the default user for the container, in this case node
docker exec -it n8n sh

# Start a shell as root
docker exec -it --user root n8n sh
```

<br />

## Resources

**Additional Services:**

- Observability services, see [OTEL.md](OTEL.md)
- https://github.com/mudler/LocalAI
- https://github.com/langflow-ai/langflow
  - visual agent builder generates LangChain code to run in production
- https://github.com/Skyvern-AI/skyvern/
  - https://www.youtube.com/watch?v=FhDYo2VKu5E
- https://github.com/windmill-labs/windmill
- https://github.com/activepieces/activepieces
- https://github.com/weaviate/weaviate
- https://github.com/Mintplex-Labs/vector-admin

- https://github.com/automatisch/automatisch
- https://github.com/airbytehq/airbyte
- https://github.com/triggerdotdev/trigger.dev
- https://github.com/mem0ai/mem0
- https://github.com/lunary-ai/lunary

- [open-health](https://github.com/OpenHealthForAll/open-health)

- [verifai](https://github.com/nikolamilosevic86/verifAI) - for detecting
  hallucinations in document based RAG, specifically biomed

- [Open Meter](https://docs.litellm.ai/docs/observability/openmeter) -
  Integrates with LiteLLM to auto charge LLM useage to clients

Not AI, but potentially useful:

- [Leaflet](https://github.com/hyperlink-academy/leaflet) - easily create and shae text docs

**Airtable alternatives:**

- https://github.com/nocodb/nocodb
- https://github.com/Budibase/budibase
- https://github.com/teableio/teable
- https://github.com/apitable/apitable

- [Agentic Memory](https://github.com/WujiangXu/AgenticMemory)

**Cloud Infrastructure & APIs:**

- https://trigger.dev/
- https://brave.com/search/api/
- https://scrapecreators.com/ - see Notion doc for full list of scraper APIs
- https://rapidapi.com/zt4096/api/phindsearch-api - Phind Search API
- https://www.krea.ai/
- https://github.com/dstackai/dstack

**AI Tools Directories:**

- https://www.futuretools.io/
- https://www.futurepedia.io/ai-tools
- https://www.aimaster.me/blog/tags/automation

**MCP:**

- https://github.com/modelcontextprotocol/inspector
- https://github.com/wild-card-ai/agents-json

**Prompts:**

- https://gamma.app/docs/10-INSANE-AI-Prompts-In-20-Minutes-f0epq82zvh5lz5e?mode=doc

## n8n

**n8n Templates:**

- https://benvansprundel.gumroad.com/l/content-repurposing-agent-team
- https://studio.ottomator.ai/
- https://github.com/coleam00/ai-agents-masterclass
- https://n8n.io/workflows/2339-breakdown-documents-into-study-notes-using-templating-mistralai-and-qdrant/
- https://n8n.io/workflows/2872-ai-agent-chatbot-long-term-memory-note-storage-telegram/

**n8n Communities:**

- https://thinktank.ottomator.ai/c/n8n/27

## Misc Videos & Articles

**YouTube Tutorials:**

See [Cole's YouTube video](https://www.youtube.com/watch?v=pOsO40HSbOo) for an
in-depth walkthrough of the original project that inspired LLemonStack.

[Cole Medin](https://www.youtube.com/@ColeMedin/videos)

- [n8n + supabase RAG](https://www.youtube.com/watch?v=PEI_ePNNfJQ) - Cole Medin
- **Misc:**
  [Browser-Use WebUI example video](https://www.youtube.com/watch?v=PRbCFgSvaco)

[Vector Store Evaluations](https://sanjmo.medium.com/vector-data-store-evaluation-criteria-6d7677ef3b60)

[Google Credentials Setup](https://pipedream.com/apps/gmail/#getting-started) -
Pipedream doc

- [Weaviate article, Agentic RAG](https://weaviate.io/blog/what-is-agentic-rag)

<br />

## WIP Solutions

### Possible Log Streaming Solutions

Configure n8n logging https://docs.n8n.io/hosting/logging-monitoring/logging/

Maybe use something like rsyslog to watch the log file? Or use something to
consolidate all the docker logs?

- https://github.com/rsyslog/rsyslog
- https://betterstack.com/community/guides/logging/docker-compose-logs/

<br />

## Related Misc

- [NVidia Container Toolkit](https://github.com/NVIDIA/nvidia-container-toolkit)
  for running docker containers with gpu access

<br />

## Zep Notes

n8n uses LangChain under the hood. There's also two variations of the zep SDK, one for the
OSS CE version and one for Cloud. LangChain has an older version of the OSS zep version that
uses `api/v1` endpoing instead of `api/v2`. This means when the "cloud" toggle is off in
the zep n8n node, n8n's zep SDK will be trying to connect to zep via the v1 api.

The latest version of the zep Docker image only provides the api/v2 endpoint.

There are a few possibilities to solve this:

1. Rolled back the zep docker image version to <=0.27.2

- See https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/nodes-langchain/nodes/memory/MemoryZep/MemoryZep.node.ts

2. Wait for LangChain and n8n to update to the latest zep-js SDK

3. [DOES NOT WORK] Toggle on the "cloud" option in n8n zep node and use a reverse proxy

See https://community.n8n.io/t/new-zep-ce-support-in-n8n/61542/2

For the reverse proxy, `api.getzep.com` needs to be mapped to the `zep` docker container.
Also, the ports need to be mapped 443 -> 8010.

Traefik is a possible solution for the reverse proxy.

Reverse proxy was successfully configured using nginx to forward traffic to zep:8000.
Authentication worked but the zep server returned a 404 for `/api/v2/collections` endpoint.
It appears the CE version has a different API schema.

```
# Zep server log
2025-03-08T08:21:07.426Z INFO HTTP Request Served {"proto": "HTTP/1.0", "method": "GET", "path": "/api/v2/collections", "request_id": "", "duration": "122.166µs", "status": 404, "response_size": 19}
```

The ONLY solution at this time is to roll back the zep container image to 0.27 until
langchain and n8n update their zep-js package version.

<br />

## Postgres Notes

LLemonStack includes scripts for creating custom postgres schemas.
These are effectively separate databases inside of postgres and can be used
to keep services isolated. At the very least, it prevents services from
clobbering other services tables. For services like n8n that support table
prefixes, custom schemas are not needed. For flowise, zep, etc. creating a custom
schema is advised.

```bash
# Create a new schema for flowise
deno run schema:create flowise
# Outputs a postgres username and password
# Use the username and password in docker/docker-compose.flowise.yml
# BEFORE starting up flowise for the first time.

# Flowise will then create it's tables inside of the service_flowise schema.
```

The custom schema flows really need to be added to the init script.
Until then, the schema stuff is more for experimentation with new services in the
the stack.

It's probably best to completely refactor the scripts to separate services into
modules that manage their own init, start, stop, etc. Basically modules that can
auto configure themselves when their init functions are called.

```bash
# POSTGRES_PASSWORD is likely NOT in the current env, get it from .env files
source .env
# Or manually replace it in the below connection string

# Connect directly from host to llemonstack postgres running in docker
psql 'postgres://postgres.llemonstack:${POSTGRES_PASSWORD}@localhost:5432/postgres'
```

For postgres admin tools like TablePlus running on the host...

```bash
host: localhost
port: 5432
user: postgres.llemonstack
pass: ${POSTGRES_PASSWORD}
database: postgres
ssl: PREFERRED, or DISABLED
```

Note the `llemonstack` tenant ID in the user name. This needs to match the POOLER_TENANT_ID
in `docker/supabase.env` file.
