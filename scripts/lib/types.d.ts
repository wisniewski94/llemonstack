import {
  CommandError as CommandErrorClass,
  RunCommandOutput as RunCommandOutputClass,
} from './command.ts'

export type { Service } from './service.ts'

export interface LLemonStackConfig {
  initialized: string // ISO 8601 timestamp if initialized, otherwise empty
  version: string // Version of LLemonStack used to create the config
  projectName: string
  envFile: string
  timestamp?: string // ISO 8601 timestamp from 0.1.0 config
  dirs: {
    config: string // .llemonstack
    repos: string
    import: string
    shared: string
    volumes: string
    services?: string
  }
  services: {
    [key: string]: {
      enabled: boolean | 'auto'
      profiles?: string[]
    }
  }
}

export type EnvVars = Record<string, string | boolean | number>

export interface CommandOutput {
  stdout: string
  stderr: string
  code: number
  success: boolean
  signal?: Deno.Signal | null
}

export type RunCommandOutput = InstanceType<typeof RunCommandOutputClass>

export type CommandError = InstanceType<typeof CommandErrorClass>

export interface RunCommandOptions {
  args?: Array<string | false>
  silent?: boolean
  captureOutput?: boolean
  env?: EnvVars
  autoLoadEnv?: boolean
  debug?: boolean
}

export type OllamaProfile =
  | 'ollama-cpu'
  | 'ollama-gpu-amd'
  | 'ollama-gpu-nvidia'
  | 'ollama-host'
  | 'ollama-false'

export interface RepoService {
  url: string // URL of the repo
  dir: string // Name of repo dir to use in the repos folder
  sparseDir?: string | string[] // Directory to sparse clone into
  sparse: boolean // Whether to sparse clone
  checkFile?: string // File to check for existence to determine if repo is ready
}

export interface ServiceImage {
  service: string
  containerName: string
  image: string
  build?: string
  version?: string
  imageName?: string // The name of the image without the version
}

/**
 * From service's llemonstack.yaml
 */
export interface ServiceConfig {
  service: string // The name of the service
  name: string // Friendly name of the service to show to users
  description: string // The description of the service
  disabled: boolean // If true, service is not loaded
  compose_file: string // The path to the docker-compose.yaml file
  service_group: string // The group of services that the service belongs to
  custom_start: boolean // Whether the service should start automatically
  repo?: RepoService // The repo to use for the service
  volumes?: string[] // The volumes to use for the service
  volumes_seeds?: {
    source: string
    destination: string
    from_repo?: true
  }[]
  provides?: Record<string, string> // The services that the service provides
  depends_on?: Record<string, { condition: string }> // The services that the service depends on
  app_version_cmd?: string[] // The command to run to get the version of the service
}

/**
 * Options for the Service class constructor
 */
export interface ServiceOptions {
  config: ServiceConfig
  dir: string
  enabled?: boolean
  repoBaseDir: string
  llemonstackConfig: LLemonStackConfig
}

// Define the type for the Docker Compose configuration
export interface ComposeYaml {
  include?: string | string[] | { path: string }[]
  services?: {
    [key: string]: {
      image?: string
      extends?: {
        file: string
        service?: string
      }
      build?: {
        dockerfile: string
        context?: string
        dockerfile_inline?: string
      }
      container_name?: string
    }
  }
}

//
// TryCatchResult
//

export type LogMessage =
  & {
    level: 'error' | 'warning' | 'info' | 'debug'
    message: string
    error?: Error | unknown // Include error object when level is "error"
    args?: unknown
  }
  & (
    | { level: 'error'; error: Error | unknown } // Error is required when level is "error"
    | { level: 'warning' | 'info' | 'debug' } // Error is not required for other levels
  )
