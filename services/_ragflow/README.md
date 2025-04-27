# RAGFlow

RAGFlow supports different backends.

Inifinity doesn't currently support arm64, so we use ElasticSearch instead to work on macOS.
Inifinity release notes shows it supports arm64:
https://github.com/infiniflow/infinity/blob/main/docs/release_notes.md?plain=1#L25
But they're not building and pushing the images to docker hub:
https://hub.docker.com/r/infiniflow/infinity/tags

Postgres instead of MySQL.

Reuses existing MinIO, Redis, and Postgres (Supabase) services.

## TODO

- [ ] Create ElasticSearch service
- [ ] Finish configuring docker-compose.yaml, .env. and conf files
- [ ] Build ragflow from scratch to support macos
  - See https://ragflow.io/docs/dev/build_docker_image
- [ ] Create custom service.ts
  - [ ] Override loadEnv: set MACOS=1 if running on mac
