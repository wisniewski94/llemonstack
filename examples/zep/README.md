# Zep CE Examples

Zep has a cloud version and the open source CE version.
Zep CE is the version installed by LLemonStack.

Zep CE is not currently working properly due to a bug in role_type_num when using
the service_zep schema created by the init script.

But since Zep CE isn't currently compatible with n8n, it's low priority to fix this.
A quick fix is to remove zep from the POSTGRES_SERVICES array in the init.ts script
and just use the default postgres user and password. Zep will then create it's
tables in the public schema and should work as expected.
