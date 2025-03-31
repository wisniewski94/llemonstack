#!/usr/bin/env node
// deno-lint-ignore-file

const { spawnSync, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Check if Deno is installed
function isDenoInstalled() {
  try {
    execSync('deno --version', { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

// Main function
function main() {
  if (!isDenoInstalled()) {
    console.error('\x1b[31mError: Deno is not installed or not in PATH\x1b[0m')
    console.log('Please install Deno from https://deno.land/')
    console.log('or run `npm install -g deno`')
    process.exit(1)
  }

  // Get the path to your cli.ts file (relative to this script)
  const scriptDir = __dirname
  const mainTsPath = path.join(scriptDir, '..', 'cli.ts')

  // Make sure the file exists
  if (!fs.existsSync(mainTsPath)) {
    console.error(`\x1b[31mError: Could not find cli.ts at ${mainTsPath}\x1b[0m`)
    process.exit(1)
  }

  // Get the command line arguments excluding node and script path
  const args = process.argv.slice(2)

  // Run the Deno script
  const result = spawnSync('deno', ['run', '--allow-all', mainTsPath, ...args], {
    stdio: 'inherit',
    shell: true,
  })

  // Exit with the same code as the Deno process
  process.exit(result.status)
}

main()
