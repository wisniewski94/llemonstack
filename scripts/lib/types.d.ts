import { Config, ServicesMapType } from '@/core/index.ts'
import {
  CommandError as CommandErrorClass,
  RunCommandOutput as RunCommandOutputClass,
} from './command.ts'

export type { ServicesMapType, ServiceType } from '@/core/index.ts'
export type { DockerComposeOptions, DockerComposePsResult } from './docker.ts'
export type { TryCatchError, TryCatchResult } from './try-catch.ts'

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
    [key: string]: IServiceConfigState
  }
}

export interface IServiceConfigState {
  enabled: boolean
  profiles?: string[]
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

export interface IRepoConfig {
  url: string // URL of the repo
  dir: string // Name of repo dir to use in the repos folder
  sparseDir?: string | string[] // Directory to sparse clone into
  sparse: boolean // Whether to sparse clone
  checkFile?: string // File to check for existence to determine if repo is ready
}

export interface IServiceImage {
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
  id?: string // The ID of the service
  service: string // The name of the service
  name: string // Friendly name of the service to show to users
  description: string // The description of the service
  disabled: boolean // If true, service is not loaded
  compose_file: string // The path to the docker-compose.yaml file
  service_group: string // The group of services that the service belongs to
  repo?: IRepoConfig // The repo to use for the service
  volumes?: string[] // The volumes to use for the service
  volumes_seeds?: {
    source: string
    destination: string
    from_repo?: true
  }[]
  provides?: Record<string, string> // The services that the service provides
  depends_on?: Record<string, { condition: string }> // The services that the service depends on
  app_version_cmd?: string[] // The command to run to get the version of the service
  exposes?: ExposeHostConfig
}

export interface IServiceState {
  enabled: boolean | null
  started: boolean | null
  healthy: boolean | null
  ready: boolean | null
  // TODO: add other states like error message
}

export type ServiceStatusType =
  | 'disabled'
  | 'loaded'
  | 'ready'
  | 'starting'
  | 'started:healthy' // Running and healthy
  | 'started:unhealthy' // Running but health check is failing
  | 'stopped'
  | 'error' // Error during start or stop

export interface IServiceGroups {
  [key: string]: ServicesMapType
}

export interface ExposeHostConfig {
  host?: {
    dashboard?: ExposeHost
    api?: ExposeHost
    [key: string]: ExposeHost | undefined
  }
  internal?: {
    api?: ExposeHost
    [key: string]: ExposeHost | undefined
  }
}

export type ExposeHostOptions = string | string[] | ExposeHost | ExposeHost[]

export type ExposeHost = {
  name?: string // The name of the host to show in the output
  _key?: string // The object path to the host in the service's llemonstack.yaml config
  url: string
  credentials?: Record<string, string> // Arbitrary key value pairs to pass to showCredentials
  info?: string // Additional info to show in the output
}

/**
 * Options for the Service class constructor
 */
export interface IServiceOptions {
  serviceConfig: ServiceConfig
  serviceDir: string
  config: Config // Instance of initialized Config class
  configSettings: IServiceConfigState // Settings from the service entry in config.json
}

// TODO: globally rename interfaces to use I prefix
export interface IServiceActionOptions {
  silent?: boolean
  config: Config
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
