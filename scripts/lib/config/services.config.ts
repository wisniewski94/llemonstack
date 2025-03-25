import { path } from '../fs.ts'
import { RequiredVolumeConfig } from '../types.d.ts'
import { Config } from './config.ts'

// Volumes relative to LLEMONSTACK_VOLUMES_DIR, required by docker-compose.yml files to start services.
// These directories will be created if they don't exist.
// If seed: Copy these dirs or files into volumes if they don't exist
export const REQUIRED_VOLUMES: RequiredVolumeConfig = [
  { volume: 'supabase/db/data' },
  { volume: 'supabase/storage' },
  {
    volume: 'supabase/functions',
    seed: [
      { // Copy these dirs into functions volumes if they don't exist
        source: ((config: Config) =>
          path.join(
            config.serviceRepoPath('supabase'),
            'docker',
            'volumes',
            'functions',
            'main',
          )),
        destination: 'main', // Relative to the volume path
      },
      {
        source: ((config: Config) =>
          path.join(
            config.serviceRepoPath('supabase'),
            'docker',
            'volumes',
            'functions',
            'hello',
          )),
        destination: 'hello',
      },
    ],
  },
  { volume: 'flowise/config' },
  { volume: 'flowise/uploads' },
  { volume: 'minio' },
]
