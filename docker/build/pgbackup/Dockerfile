FROM oven/bun:latest

# Install PostgreSQL client tools for pg_dump
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for better security
RUN groupadd -g 10001 backupuser && \
    useradd -u 10000 -g backupuser -m -s /bin/bash backupuser

# Create backup directory and set permissions
RUN mkdir -p /backups && chown backupuser:backupuser /backups

# Copy backup script
WORKDIR /app
COPY supabase-backup.ts ./
COPY package.json ./

# Install dependencies
RUN bun install

# Set to non-root user
USER backupuser

# Create a volume for the backups
VOLUME /backups

# Default environment variables (should be overridden at runtime)
ENV POSTGRES_HOST=supavisor \
    POSTGRES_PORT=5432 \
    POSTGRES_DB=postgres \
    POSTGRES_USER=postgres \
    POSTGRES_PASSWORD=password \
    SUPABASE_URL=https://your-project.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
    BACKUP_DIR=/backups \
    RETENTION_DAYS=7

# Run backup script when container starts
CMD ["bun", "run", "supabase-backup.ts"]