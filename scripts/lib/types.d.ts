import { RunCommandOutput as RunCommandOutputClass } from './runCommand.ts'

export interface Config {
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
  }
}

type EnvVars = Record<string, string | boolean | number>

export interface CommandOutput {
  stdout: string
  stderr: string
  code: number
  success: boolean
  signal?: Deno.Signal | null
}

export type RunCommandOutput = InstanceType<typeof RunCommandOutputClass>
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
  sparse?: boolean // Whether to sparse clone
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

// Define the type for the Docker Compose configuration
export interface ComposeConfig {
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
