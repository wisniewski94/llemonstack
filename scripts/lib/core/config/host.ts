/**
 * Host class
 *
 * Returns info about the host machine.
 * @see Config.host
 */
class Host {
  private static _instance: Host

  static getInstance(): Host {
    if (!Host._instance) {
      Host._instance = new Host()
    }
    return Host._instance
  }

  /**
   * Get the host OS with a friendly name
   * @returns macOS | Windows | Linux | other
   */
  get os(): 'macOS' | 'Windows' | 'Linux' | 'other' {
    switch (Deno.build.os) {
      case 'darwin':
        return 'macOS'
      case 'windows':
        return 'Windows'
      case 'linux':
        return 'Linux'
      default:
        return 'other'
    }
  }

  /**
   * Get the host architecture
   *
   * Returns a standardized architecture name of either 'x86_64' or 'arm64'
   * Deno.build.arch returns 'aarch64' for Apple Silicon
   *
   * @returns arm64 | x86_64
   */
  get arch(): 'x86_64' | 'arm64' {
    const arch = Deno.build.arch
    return arch === 'aarch64' ? 'arm64' : arch
  }

  public isArm64(): boolean {
    return this.arch === 'arm64'
  }

  public isWindows(): boolean {
    return this.os === 'Windows'
  }

  public isLinux(): boolean {
    return this.os === 'Linux'
  }

  public isMac(): boolean {
    return this.os === 'macOS'
  }
}

export default Host
