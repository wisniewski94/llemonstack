import { RelayerBase } from '@/relayer/base.ts'
import { Config, ServicesMapType } from '../core/mod.ts'
import {
  CommandError as CommandErrorClass,
  RunCommandOutput as RunCommandOutputClass,
} from '../lib/command.ts'
import { InterfaceRelayer } from '../relayer/ui/interface.ts'

export type { ServicesMapType, ServiceType } from '../core/mod.ts'
export type { DockerComposeOptions, DockerComposePsResult } from '../lib/docker.ts'
export type { TryCatchError, TryCatchResult } from '../lib/try-catch.ts'
export type { AppLogRecord } from '../relayer/base.ts'
export type { ICallStackInfo, ICallStackOptions } from '../relayer/callstack.ts'

export type RelayerInstance = InstanceType<typeof RelayerBase>
export type InterfaceRelayerInstance = InstanceType<typeof InterfaceRelayer>

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
    services?: string | string[]
  }
  services: {
    [key: string]: IServiceConfigState
  }
}

export interface IServiceConfigState {
  enabled: boolean | 'auto'
  profiles?: string[]
}

export type EnvVars = Record<string, string | boolean | number>

export interface CommandOutput {
  stdout: string
  stderr: string
  code: number
  success: boolean
  signal?: Deno.Signal | null
  cmd: string // The command that was run
}

export type RunCommandOutput = InstanceType<typeof RunCommandOutputClass>

export type CommandError = InstanceType<typeof CommandErrorClass>

export interface RunCommandOptions {
  args?: Array<string | false | null | undefined>
  silent?: boolean
  captureOutput?: boolean
  env?: EnvVars
  autoLoadEnv?: boolean
  debug?: boolean
  relayer?: RelayerInstance
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
  checkFile?: string | string[] // File to check for existence to determine if repo is ready
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
export interface ServiceYaml {
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
  enabled: boolean
  started: boolean | null
  healthy: boolean | null
  ready: boolean | null
  last_checked: Date | null
  state: string | null // Value of state string from Docker Compose ps
}

export type ServiceStatusType =
  | 'disabled'
  | 'loaded'
  | 'ready'
  | 'starting'
  | 'started' // Started but health is unknown
  | 'running' // Running and healthy
  | 'unhealthy' // Running but health check is failing
  | 'stopped'
  | 'error' // Error during start or stop

export type IServicesGroups = Map<string, ServicesMapType>

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
  serviceYaml: ServiceYaml
  serviceDir: string
  config: Config // Instance of initialized Config class
  configSettings: IServiceConfigState // Settings from the service entry in config.json
  enabled: boolean
}

export interface IServiceActionOptions {
  silent?: boolean
}

export interface IServiceStartOptions extends IServiceActionOptions {
  envVars?: EnvVars
  build?: boolean
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
