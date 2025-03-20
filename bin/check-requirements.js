const { execSync } = require('child_process')
const { platform } = require('os')

function checkDeno() {
  try {
    execSync('deno --version', { stdio: 'ignore' })
    console.log('Deno is installed')
    return true
  } catch {
    return false
  }
}

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' })
    console.log('Docker is installed')
    return true
  } catch {
    return false
  }
}

function checkGit() {
  try {
    execSync('git --version', { stdio: 'ignore' })
    console.log('Git is installed')
    return true
  } catch {
    return false
  }
}

function checkBrew() {
  try {
    execSync('brew --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function checkAptGet() {
  try {
    execSync('apt-get --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function checkApk() {
  try {
    execSync('apk --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function installDeno() {
  console.log('Installing Deno: npm install -g deno')
  try {
    // Install Deno using the official install script
    // Alternate install script: 'curl -fsSL https://deno.land/x/install/install.sh | sh'
    execSync('npm install -g deno', {
      stdio: 'inherit',
    })
    return true
  } catch (error) {
    console.error('Failed to install Deno:', error)
    return false
  }
}

function installGit() {
  try {
    if (platform() === 'darwin') {
      if (checkBrew()) {
        console.log('Installing git using Homebrew: brew install git')
        execSync('brew install git', {
          stdio: 'inherit',
        })
      } else {
        throw new Error('Homebrew is not installed')
      }
    } else if (checkAptGet()) {
      console.log('Installing git using package manager: sudo apt-get install git')
      execSync('sudo apt-get update && sudo apt-get install git', {
        stdio: 'inherit',
      })
    } else if (checkApk()) {
      console.log('Installing git using package manager: sudo apk add git')
      execSync('sudo apk update && sudo apk add git', {
        stdio: 'inherit',
      })
    } else {
      throw new Error('No supported package manager found')
    }
    console.log('Git installed successfully!')
    return true
  } catch (error) {
    console.error('Failed to install Git:', error)
    return false
  }
}

function main() {
  let requirementsMet = true
  if (!checkDeno()) {
    if (installDeno()) {
      console.log('Deno installed successfully!')
    } else {
      console.log(
        'Please install Deno manually from https://deno.land/manual/getting_started/installation',
      )
      requirementsMet = false
    }
  }
  if (!checkGit()) {
    if (platform() === 'win32') {
      console.error('Git is not installed. Please install Git before using LLemonStack.')
      console.log('Download Git for Windows from https://git-scm.com/downloads/win')
      requirementsMet = false
    } else {
      if (installGit()) {
        console.log('Git installed successfully!')
      } else {
        console.log('Please install Git manually from https://git-scm.com/downloads')
        requirementsMet = false
      }
    }
  }
  if (!checkDocker()) {
    console.error('Docker is not installed. Please install Docker before using LLemonStack.')
    console.log('Download Docker Desktop from https://www.docker.com/')
    requirementsMet = false
  }
  if (!requirementsMet) {
    console.error('Requirements not met. Please see above error messages to install missing requirements before using LLemonStack.')
    process.exit(1)
  } else {
    console.log('All requirements met. LLemonStack is ready to use!')
    process.exit(0)
  }
}

main()

