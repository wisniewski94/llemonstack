# Zep CE Examples

Zep has a cloud version and the open source CE version.
Zep CE is the version installed by LLemonStack.

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

## Quick Fix

1. Open Supabase dashboard: http://localhost:8000
2. Go to SQL Editor
3. Run this query:

   `CREATE DOMAIN public.role_type_enum AS service_zep.role_type_enum;`

Then rerun the zep.ts example script in this folder.

```bash
ZEP_API_SECRET=your-zep-api-key deno examples/zep/zep.ts
```

The script should work without throwing any errors.
