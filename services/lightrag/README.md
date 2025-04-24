# LightRAG

LighRAG is a leading RAG system that substantially outperforms naive RAG implementations.

The LLemonStack LightRAG service is configured to store data in postgres + neo4j and use
OpenAI for embedding and LLM queries. Settings can be changed in the project's `.env`
file to change the LLM and embedding models or providers.

By default, LightRAG is configured to use OpenAI gpt-4.1 and text-embedding-3-small.

The LightRAG service provides a web UI and API. The API can be used directly,
but it also provides a Ollama-compatible query interface that can be used by any
other service. When LightRAG's Ollama API is queried, it acts like an Ollama
LLM endpoint and transparently leverages the RAG system to improve it's query response.

LightRAG's Ollama-compatible query API provides several query modes that are enabled
by prefixing the user query with `/[mode]`. If no mode prefix is present, LightRAG
defaults to hybrid mode. See [Query Modes](https://github.com/HKUDS/LightRAG/blob/main/lightrag/api/README.md#choose-query-mode-in-chat) for a full list.

## References

- https://github.com/HKUDS/LightRAG/blob/main/lightrag/api/README.md
- [Query Modes](https://github.com/HKUDS/LightRAG/blob/main/lightrag/api/README.md#choose-query-mode-in-chat)

## Overview

LightRAG uses 4 types of storage for different purposes:

- KV_STORAGE: llm response cache, text chunks, document information
- VECTOR_STORAGE: entities vectors, relation vectors, chunks vectors
- GRAPH_STORAGE: entity relation graph
- DOC_STATUS_STORAGE: document indexing status

Supabase postgres can be used for KV, vector, and docs.
Neo4J or Apache AGE (Graph Database for PostgreSQL) is needed for graph storage.

Configuration is done through...

1. CLI args
2. .env vars
3. config.ini

There's no need for the config.ini if everything is in .env
