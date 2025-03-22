import type { CommandOutput } from './types.d.ts'

export class RunCommandOutput {
  private _output: CommandOutput
  constructor(output: CommandOutput) {
    this._output = output
  }
  get stdout(): string {
    return this._output.stdout
  }
  get stderr(): string {
    return this._output.stderr
  }
  get code(): number {
    return this._output.code
  }
  get success(): boolean {
    return this._output.success
  }
  get signal(): Deno.Signal | null | undefined {
    return this._output.signal
  }
  toString(): string {
    return this._output.stdout
  }
  toList(): string[] {
    return this._output.stdout.split('\n').filter(Boolean).map((line) => line.trim())
  }
  toJsonList(): Array<Record<string, unknown>> {
    const output = this._output.stdout.trim()
    return !output ? [] : output.split('\n').map((output) => JSON.parse(output)).filter(
      Boolean,
    )
  }
}

// Custom error class for runCommand
export class CommandError extends Error {
  code: number
  stdout: string
  stderr: string
  cmd: string // the command that was run

  constructor(
    message: string,
    {
      code,
      stdout,
      stderr,
      cmd,
    }: {
      code: number
      stdout: string
      stderr: string
      cmd: string
    },
  ) {
    super(message)
    this.code = code
    this.stdout = stdout
    this.stderr = stderr
    this.cmd = cmd
  }
  override toString(): string {
    let str = this.message
    str += this.cmd ? `\nCmd: '${this.cmd}'` : ''
    str += this.stderr ? `\nError:${this.stderr}` : ''
    return str
  }
}
