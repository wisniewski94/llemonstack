# How to Use This Backup

This directory contains a complete Supabase backup solution that runs in a Docker container. Here's
how to use it:

## Setup

```bash
# Build and run the container:
docker-compose build
docker-compose up -d

# For manual backups:
docker-compose run backup
```

## Scheduled backups

The docker-compose.yml includes an Ofelia scheduler container that will run the backup daily.

## How it Works

The solution follows your domain-first modeling approach:

The backup process is modeled with clear interfaces (BackupConfig and BackupResult) The script loads
configuration from environment variables It performs the backup using PostgreSQL's pg_dump Old
backups are cleaned up based on retention policy I've included a placeholder for S3 uploads, which
you can implement if needed

### Features

Security: Runs as a non-root user in the container Persistence: Uses Docker volumes to persist
backups Configuration: Environment variables for all settings Retention: Automatically cleans up old
backups Scheduling: Includes container setup for scheduled backups

### Customization

If you want to add S3 upload functionality, you would need to:

- Add AWS SDK to package.json
- Implement the uploadToS3 function in the TypeScript file
- Uncomment the relevant line in the main function
- Set the AWS environment variables in your .env file
