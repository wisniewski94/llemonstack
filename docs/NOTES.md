# WIP Notes

This is just a scratchpad for WIP project notes to keep the main README clean.

## TODO

- [ ] Record video demo
- [ ] Create new n8n workflow templates?

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

## Resources

**Additional Services:**

- https://github.com/Skyvern-AI/skyvern/
  - https://www.youtube.com/watch?v=FhDYo2VKu5E
- https://github.com/windmill-labs/windmill
- https://github.com/activepieces/activepieces
- https://github.com/weaviate/weaviate
- https://github.com/Mintplex-Labs/vector-admin

- https://github.com/automatisch/automatisch
- https://github.com/airbytehq/airbyte
- https://github.com/triggerdotdev/trigger.dev

- [open-health](https://github.com/OpenHealthForAll/open-health)

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

## Acknowledgements & History

This project started as a fork of Cole [Local AI Starter Kit](https://github.com/coleam00/local-ai-packaged)
which was a fork of the n8n team's [Self-hosted AI Starter Kit](https://github.com/n8n-io/self-hosted-ai-starter-kit).

See [Cole's YouTube video](https://www.youtube.com/watch?v=pOsO40HSbOo) for an
in-depth walkthrough of the original project.

The scripts in this project were rewritten in typescript and significantly
enhanced to with support for enabling/disabling services and avoiding
common Docker pitfalls.
