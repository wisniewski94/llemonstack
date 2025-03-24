import * as fs from '../fs.ts'
import { path } from '../fs.ts'
import { ComposeService, RepoService, RequiredVolumeConfig } from '../types.d.ts'
import { Config } from './config.ts'

// TODO: move to service yaml files
export const ALL_COMPOSE_SERVICES: ComposeService[] = [
  ['supabase', fs.path.join('supabase', 'docker-compose.yaml'), true],
  ['n8n', fs.path.join('n8n', 'docker-compose.yaml'), true],
  ['flowise', fs.path.join('flowise', 'docker-compose.yaml'), true],
  ['neo4j', fs.path.join('neo4j', 'docker-compose.yaml'), true],
  ['zep', fs.path.join('zep', 'docker-compose.yaml'), true],
  ['browser-use', fs.path.join('browser-use', 'docker-compose.yaml'), true], // Uses a custom start function
  ['qdrant', fs.path.join('qdrant', 'docker-compose.yaml'), true],
  ['openwebui', fs.path.join('openwebui', 'docker-compose.yaml'), true],
  ['ollama', fs.path.join('ollama', 'docker-compose.yaml'), false], // Uses a custom start function
  ['prometheus', fs.path.join('prometheus', 'docker-compose.yaml'), true],
  ['redis', fs.path.join('redis', 'docker-compose.yaml'), true],
  ['clickhouse', fs.path.join('clickhouse', 'docker-compose.yaml'), true],
  ['minio', fs.path.join('minio', 'docker-compose.yaml'), true],
  ['langfuse', fs.path.join('langfuse', 'docker-compose.yaml'), true],
  ['litellm', fs.path.join('litellm', 'docker-compose.yaml'), true],
  ['dozzle', fs.path.join('dozzle', 'docker-compose.yaml'), true],
]

// Groups of services, dependencies first
export const SERVICE_GROUPS: [string, string[]][] = [
  ['databases', [
    'supabase',
    'redis',
    'clickhouse',
    'neo4j',
    'qdrant',
    'prometheus',
    'minio',
  ]],
  ['middleware', ['dozzle', 'langfuse', 'litellm', 'zep']],
  ['apps', ['n8n', 'flowise', 'browser-use', 'openwebui', 'ollama']],
]

// Services that require cloning a repo
export const REPO_SERVICES: Record<string, RepoService> = {
  supabase: {
    url: 'https://github.com/supabase/supabase.git',
    dir: 'supabase',
    sparseDir: 'docker',
    checkFile: 'docker/docker-compose.yml',
  },
  zep: {
    url: 'https://github.com/getzep/zep.git',
    dir: 'zep',
    checkFile: 'docker-compose.ce.yaml',
  },
  'browser-use': {
    url: 'https://github.com/browser-use/web-ui.git',
    dir: 'browser-use-web-ui',
    sparse: false,
    checkFile: 'docker-compose.yml',
  },
  // 'signoz': {
  //   url: 'https://github.com/SigNoz/signoz.git',
  //   dir: 'signoz',
  //   sparseDir: 'deploy',
  //   checkFile: 'docker-compose.yml',
  // },
}

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
