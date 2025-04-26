# Zep CE Examples

[Zep CE](https://github.com/getzep/zep) is no longer maintained as of April 2025.

Zep self hosted (local) is not yet compatible with the n8n node. However, you can run custom code
in n8n and other stack components to use the local Zep service.

Zep has a cloud version and the open source CE version.
Zep CE is the version installed by LLemonStack.

## Workaround

Zep CE is not currently working without a manual quick fix (see below).

Zep throws and error about `public.role_type_num` when using
the service_zep schema and trying to call zep's updateMessageMetadata function.

This is the line in the Zep CE server that causes the issue:

https://github.com/getzep/zep/blob/main/src/store/schema_common.go#L79

The example script only fails on updateMessageMetadata call.
The rest of the script seems to work.

Submitted bug to zep team: https://github.com/getzep/zep/issues/388

A quick fix is to make an alias for `public.role_type_num` directly in postgres.

This seems to work fine while we wait for a fix from zep.

### Quick Fix

1. Open Supabase dashboard: http://localhost:8000
2. Go to SQL Editor
3. Run this query:

   `CREATE DOMAIN public.role_type_enum AS service_zep.role_type_enum;`

Then rerun the zep.ts example script in this folder.

```bash
ZEP_API_SECRET=your-zep-api-key deno examples/zep/zep.ts
```

The script should work without throwing any errors.

## Zep & n8n

n8n uses LangChain under the hood. There's also two variations of the zep SDK, one for the OSS CE
version and one for Cloud. LangChain has an older version of the OSS zep version that uses `api/v1`
endpoing instead of `api/v2`. This means when the "cloud" toggle is off in the zep n8n node, n8n's
zep SDK will be trying to connect to zep via the v1 api.

The latest version of the zep Docker image only provides the api/v2 endpoint.

There are a few possibilities to solve this:

1. Rolled back the zep docker image version to <=0.27.2

- See
  https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/nodes-langchain/nodes/memory/MemoryZep/MemoryZep.node.ts

2. Wait for LangChain and n8n to update to the latest zep-js SDK

3. [DOES NOT WORK] Toggle on the "cloud" option in n8n zep node and use a reverse proxy

See https://community.n8n.io/t/new-zep-ce-support-in-n8n/61542/2

For the reverse proxy, `api.getzep.com` needs to be mapped to the `zep` docker container. Also, the
ports need to be mapped 443 -> 8010.

Traefik is a possible solution for the reverse proxy.

Reverse proxy was successfully configured using nginx to forward traffic to zep:8000. Authentication
worked but the zep server returned a 404 for `/api/v2/collections` endpoint. It appears the CE
version has a different API schema.

```
# Zep server log
2025-03-08T08:21:07.426Z INFO HTTP Request Served {"proto": "HTTP/1.0", "method": "GET", "path": "/api/v2/collections", "request_id": "", "duration": "122.166µs", "status": 404, "response_size": 19}
```

The ONLY solution at this time is to roll back the zep container image to 0.27 until langchain and
n8n update their zep-js package version.
