// supabase-backup.ts - A script to backup Supabase databases
// Usage: bun run supabase-backup.ts
// @ts-nocheck
// deno-lint-ignore-file

import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

// Promisify exec for cleaner async/await usage
const execAsync = promisify(exec)

// Domain model for our backup process
interface BackupConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  pgHost: string
  pgPort: string
  pgDatabase: string
  pgUser: string
  pgPassword: string
  backupDir: string
  retentionDays: number
}

interface BackupResult {
  filename: string
  timestamp: string
  size: number
  path: string
  success: boolean
  error?: string
}

// Load configuration from environment variables
function loadConfig(): BackupConfig {
  // Validate required environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
  ]

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    pgHost: process.env.POSTGRES_HOST!,
    pgPort: process.env.POSTGRES_PORT || '5432',
    pgDatabase: process.env.POSTGRES_DB!,
    pgUser: process.env.POSTGRES_USER!,
    pgPassword: process.env.POSTGRES_PASSWORD!,
    backupDir: process.env.BACKUP_DIR || '/backups',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
  }
}

// Ensure backup directory exists
async function ensureBackupDir(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    console.log(`Creating backup directory: ${dir}`)
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Generate backup filename with timestamp
function generateBackupFilename(dbName: string): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  return `${dbName}_${timestamp}.sql.gz`
}

// Perform database backup using pg_dump
async function backupDatabase(config: BackupConfig): Promise<BackupResult> {
  const timestamp = new Date().toISOString()
  const filename = generateBackupFilename(config.pgDatabase)
  const backupPath = path.join(config.backupDir, filename)

  try {
    // Use pg_dump to create a compressed backup file
    const cmd =
      `PGPASSWORD="${config.pgPassword}" pg_dump -h ${config.pgHost} -p ${config.pgPort} -U ${config.pgUser} -d ${config.pgDatabase} -F c | gzip > ${backupPath}`

    console.log(`Starting backup: ${filename}`)
    await execAsync(cmd)

    // Get file size
    const stats = fs.statSync(backupPath)

    return {
      filename,
      timestamp,
      size: stats.size,
      path: backupPath,
      success: true,
    }
  } catch (error) {
    console.error('Backup failed:', error)
    return {
      filename,
      timestamp,
      size: 0,
      path: backupPath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Clean up old backups beyond retention period
async function cleanupOldBackups(config: BackupConfig): Promise<void> {
  console.log(`Cleaning up backups older than ${config.retentionDays} days`)

  const files = fs.readdirSync(config.backupDir)
  const now = new Date()

  for (const file of files) {
    if (!file.endsWith('.sql.gz')) continue

    const filePath = path.join(config.backupDir, file)
    const stats = fs.statSync(filePath)
    const fileDate = new Date(stats.mtime)

    // Calculate age in days
    const ageInDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24)

    if (ageInDays > config.retentionDays) {
      console.log(`Removing old backup: ${file} (${Math.floor(ageInDays)} days old)`)
      fs.unlinkSync(filePath)
    }
  }
}

// Optional: Upload backup to S3 or other storage
async function uploadToS3(result: BackupResult): Promise<void> {
  // This would be implemented with AWS SDK or similar
  // Left as an exercise for specific implementation
  console.log(`Would upload ${result.filename} to S3 here`)
}

// Main backup function
async function main() {
  try {
    console.log('Starting Supabase backup process')

    // Load configuration
    const config = loadConfig()

    // Ensure backup directory exists
    await ensureBackupDir(config.backupDir)

    // Run the backup
    const result = await backupDatabase(config)

    if (result.success) {
      console.log(
        `Backup completed successfully: ${result.filename} (${
          (result.size / 1024 / 1024).toFixed(2)
        } MB)`,
      )

      // Cleanup old backups
      await cleanupOldBackups(config)

      // Uncomment to enable S3 uploads
      // await uploadToS3(result);
    } else {
      console.error('Backup failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error during backup process:', error)
    process.exit(1)
  }
}

// Run the script
main()
