/**
 * This is AI generated test to see about stubbing out fs functions
 * to test the config file loading and saving.
 *
 * It doesn't work yet. Keeping here for future reference.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std/assert/mod.ts'
import { returnsNext, stub } from 'https://deno.land/std/testing/mock.ts'
import * as path from 'jsr:@std/path'
import { Config } from '../scripts/lib/config.ts'
import { LLemonStackConfig } from '../scripts/lib/types.d.ts'

// Create stubs for Deno functions
let existsSyncStub = stub(
  Deno,
  'stat',
  returnsNext([Promise.resolve({
    isFile: true,
    isDirectory: false,
    isSymlink: false,
    size: 0,
    mtime: new Date(),
    atime: new Date(),
    birthtime: new Date(),
    ctime: new Date(),
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    blocks: 0,
    isBlockDevice: false,
    isCharDevice: false,
    isFifo: false,
    isSocket: false,
  } as Deno.FileInfo)]),
)

let readFileSyncStub = stub(Deno, 'readTextFile', returnsNext([Promise.resolve('{}')]))

Deno.test('Config', async (t) => {
  let config: Config

  await t.step('setup', () => {
    // Reset stubs before each test group
    existsSyncStub.restore()
    readFileSyncStub.restore()

    config = Config.getInstance()

    // Setup default stub implementations
    existsSyncStub = stub(
      Deno,
      'stat',
      returnsNext([Promise.resolve({
        isFile: true,
        isDirectory: false,
        isSymlink: false,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        ctime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
        isBlockDevice: false,
        isCharDevice: false,
        isFifo: false,
        isSocket: false,
      } as Deno.FileInfo)]),
    )

    readFileSyncStub = stub(
      Deno,
      'readTextFile',
      returnsNext([
        Promise.resolve('TEST_KEY=test_value\nDB_URL=mongodb://localhost'),
        Promise.resolve('{}'),
      ]),
    )
  })

  await t.step('initialize', async (t) => {
    await t.step('should initialize with default values when no config file exists', () => {
      existsSyncStub.restore()
      existsSyncStub = stub(
        Deno,
        'stat',
        returnsNext([Promise.resolve({
          isFile: false,
          isDirectory: false,
          isSymlink: false,
          size: 0,
          mtime: new Date(),
          atime: new Date(),
          birthtime: new Date(),
          ctime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0,
          nlink: 0,
          uid: 0,
          gid: 0,
          rdev: 0,
          blksize: 0,
          blocks: 0,
          isBlockDevice: false,
          isCharDevice: false,
          isFifo: false,
          isSocket: false,
        } as Deno.FileInfo)]),
      )

      config.initialize()

      assertEquals(config.project, {
        initialized: '',
        version: '0.2.0',
        projectName: 'llemonstack',
        envFile: '.env',
        dirs: {
          config: '.llemonstack',
          repos: '.llemonstack/repos',
          import: 'import',
          shared: 'shared',
          volumes: 'volumes',
        },
        services: {},
      } as LLemonStackConfig)
    })

    await t.step('should load existing configuration when config file exists', () => {
      const testConfig: LLemonStackConfig = {
        initialized: new Date().toISOString(),
        version: '0.2.0',
        projectName: 'test-project',
        envFile: '.env',
        dirs: {
          config: '.llemonstack',
          repos: '.llemonstack/repos',
          import: 'import',
          shared: 'shared',
          volumes: 'volumes',
          services: '.llemonstack/services',
        },
        services: {
          'n8n': {
            'enabled': true,
            'profiles': [],
          },
          'flowise': {
            'enabled': true,
            'profiles': [],
          },
          'openwebui': {
            'enabled': true,
            'profiles': [],
          },
          'browser-use': {
            'enabled': true,
            'profiles': [],
          },
          'langfuse': {
            'enabled': true,
            'profiles': [],
          },
          'litellm': {
            'enabled': true,
            'profiles': [],
          },
          'qdrant': {
            'enabled': true,
            'profiles': [],
          },
          'dozzle': {
            'enabled': true,
            'profiles': [],
          },
          'ollama': {
            'enabled': true,
            'profiles': [
              'ollama-host',
            ],
          },
          'minio': {
            'enabled': true,
            'profiles': [],
          },
          'redis': {
            'enabled': true,
            'profiles': [],
          },
          'supabase': {
            'enabled': true,
            'profiles': [],
          },
          'neo4j': {
            'enabled': true,
            'profiles': [],
          },
          'clickhouse': {
            'enabled': true,
            'profiles': [],
          },
          'zep': {
            'enabled': true,
            'profiles': [],
          },
          'prometheus': {
            'enabled': true,
            'profiles': [],
          },
        },
      }
      readFileSyncStub.restore()
      readFileSyncStub = stub(
        Deno,
        'readTextFile',
        returnsNext([Promise.resolve(JSON.stringify(testConfig))]),
      )

      config.initialize()

      assertEquals(config.project, testConfig)
    })

    await t.step('should handle invalid JSON in config file', () => {
      readFileSyncStub.restore()
      readFileSyncStub = stub(Deno, 'readTextFile', returnsNext([Promise.resolve('invalid json')]))

      assertThrows(() => config.initialize())
    })
  })

  await t.step('loadEnv', async (t) => {
    await t.step('should load environment variables from .env file', () => {
      config.loadEnv()

      assertEquals(Deno.env.get('TEST_KEY'), 'test_value')
      assertEquals(Deno.env.get('DB_URL'), 'mongodb://localhost')
    })

    await t.step('should not throw when .env file does not exist', () => {
      existsSyncStub.restore()
      existsSyncStub = stub(
        Deno,
        'stat',
        returnsNext([Promise.resolve({
          isFile: false,
          isDirectory: false,
          isSymlink: false,
          size: 0,
          mtime: new Date(),
          atime: new Date(),
          birthtime: new Date(),
          ctime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0,
          nlink: 0,
          uid: 0,
          gid: 0,
          rdev: 0,
          blksize: 0,
          blocks: 0,
          isBlockDevice: false,
          isCharDevice: false,
          isFifo: false,
          isSocket: false,
        } as Deno.FileInfo)]),
      )

      config.loadEnv() // Should not throw
    })

    await t.step('should handle multiple .env files in different environments', () => {
      Deno.env.set('NODE_ENV', 'development')

      existsSyncStub.restore()
      existsSyncStub = stub(
        Deno,
        'stat',
        returnsNext([Promise.resolve({
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          size: 0,
          mtime: new Date(),
          atime: new Date(),
          birthtime: new Date(),
          ctime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0,
          nlink: 0,
          uid: 0,
          gid: 0,
          rdev: 0,
          blksize: 0,
          blocks: 0,
          isBlockDevice: false,
          isCharDevice: false,
          isFifo: false,
          isSocket: false,
        } as Deno.FileInfo)]),
      )

      readFileSyncStub.restore()
      readFileSyncStub = stub(
        Deno,
        'readTextFile',
        returnsNext([Promise.resolve('DEV_KEY=dev_value')]),
      )

      config.loadEnv()

      assertEquals(Deno.env.get('DEV_KEY'), 'dev_value')
    })
  })

  // Clean up after all tests
  await t.step('teardown', () => {
    existsSyncStub.restore()
    readFileSyncStub.restore()
  })
})

// If you need integration tests with real file system access
Deno.test('Config Integration Tests', async (t) => {
  const tmpDir = path.join(Deno.cwd(), 'tmp', 'test')

  await t.step('setup', () => {
    if (!Deno.statSync(tmpDir).isFile) {
      Deno.mkdirSync(tmpDir, { recursive: true })
    }
  })

  // Add integration tests here

  await t.step('cleanup', () => {
    if (Deno.statSync(tmpDir).isFile) {
      Deno.removeSync(tmpDir, { recursive: true })
    }
  })
})
