import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertNotEquals,
  assertStrictEquals,
} from 'jsr:@std/assert'
import { Stub, stub } from 'jsr:@std/testing/mock'
import * as fs from '../../../lib/fs.ts'
import { Config, config } from '../config.ts'

const VERSION = '0.3.0'

Deno.test('Config', async (t) => {
  let saveStub: Stub

  // Set up the stub before all tests
  await t.step('setup', () => {
    // Prevent tests from saving config files to disk
    // @ts-ignore - accessing private method for testing
    saveStub = stub(Config.prototype, 'save', () => {
      // console.log('saveStub called')
      return {
        data: true,
        error: null,
        success: true,
      }
    })
  })

  await t.step('getInstance should return a singleton instance', () => {
    const instance1 = Config.getInstance()
    const instance2 = Config.getInstance()

    assertStrictEquals(instance1, config)
    assertStrictEquals(instance1, instance2)
  })

  await t.step('default paths are configured', () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()

    const expectedRepoDir = fs.path.join(configInstance.configDir, 'repos')
    assertEquals(configInstance.reposDir, expectedRepoDir)

    const expectedServicesDir = [fs.path.join(configInstance.installDir, 'services')]
    assertEquals(configInstance.servicesDirs, expectedServicesDir)

    const expectedImportDir = fs.path.join(Deno.cwd(), 'import')
    assertEquals(configInstance.importDir, expectedImportDir)

    const expectedSharedDir = fs.path.join(Deno.cwd(), 'shared')
    assertEquals(configInstance.sharedDir, expectedSharedDir)
  })

  await t.step('initialize - success case', async () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()
    const result = await configInstance.initialize()

    assertEquals(result.success, true)
    assertExists(result.data)
    assertExists(configInstance.project.dirs.config)
    assertEquals(result.error, null)
  })

  await t.step('initialize - error handling', async () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()

    // @ts-ignore - temporarily override for testing
    configInstance._initialized = false
    // @ts-ignore - temporarily override for testing
    configInstance._configFile = '' // Try to load the configDir instead of a file

    const result = await configInstance.initialize()

    assertEquals(result.success, false, 'Success should be false')
    assertExists(result.error, 'Error should exist')
  })

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})

Deno.test('Config initialization - templates', async (t) => {
  let saveStub: Stub

  // Set up the stub before all tests
  await t.step('setup', () => {
    // Prevent tests from saving config files to disk
    // @ts-ignore - accessing private method for testing
    saveStub = stub(Config.prototype, 'save', () => {
      // console.log('saveStub called')
      return {
        data: true,
        error: null,
        success: true,
      }
    })
  })

  await t.step('Returns error when config file not found', async () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()
    // @ts-ignore - temporarily override for testing
    configInstance._initialized = false

    const result = await configInstance.initialize('some-non-existent-file.json')

    // Verify that save was called once
    assertEquals(saveStub.calls.length, 0, 'save method should not be called')

    assertEquals(result.success, false)
    assertExists(result.error)

    // Assert that the error is of type Deno.errors.NotFound
    assertInstanceOf(result.error, Deno.errors.NotFound, 'Error should be of type NotFound')
    // Check that the messages array contains the expected message about creating from template

    assertExists(result.messages)

    const hasErrorMessage = result.messages.some((msg) =>
      msg.message.includes('file not found') && msg.level === 'error'
    )
    assertEquals(
      hasErrorMessage,
      true,
      'Expected message about creating from template not found',
    )
    assertExists(result.data)
  })

  await t.step('Create missing config from template when init is true', async () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()
    // @ts-ignore - temporarily override for testing
    configInstance._initialized = false

    const result = await configInstance.initialize('some-non-existent-file.json', { init: true })

    // Verify that save was called once
    assertEquals(saveStub.calls.length, 1, 'save method should be called exactly once')

    // Check that the messages array contains the expected message about creating from template
    assertExists(result.messages)
    const hasTemplateMessage = result.messages.some((msg) =>
      msg.message.includes('creating from template') && msg.level === 'info'
    )
    assertEquals(
      hasTemplateMessage,
      true,
      'Expected message about creating from template not found',
    )
    assertEquals(result.success, true)
    assertExists(result.data)
    assertEquals(result.error, null)
  })

  await t.step('isValidConfig validates project config correctly', () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()

    // Valid config should include services from config.VERSION.json
    const validConfig = {
      initialized: true,
      version: '0.3.0',
      projectName: 'test',
      envFile: '.env',
      dirs: {
        config: '.llemonstack',
        repos: 'repos',
        shared: 'shared',
        import: 'import',
        volumes: 'volumes',
      },
      services: {
        n8n: { enabled: true },
        flowise: { enabled: true },
        openwebui: { enabled: true },
        'browser-use': { enabled: true },
        langfuse: { enabled: true },
        litellm: { enabled: true },
        qdrant: { enabled: true },
        dozzle: { enabled: true },
        ollama: { enabled: true, profiles: ['ollama-host'] },
        minio: { enabled: 'auto' },
        redis: { enabled: 'auto' },
        supabase: { enabled: 'auto' },
        neo4j: { enabled: 'auto' },
        clickhouse: { enabled: 'auto' },
        zep: { enabled: false },
        prometheus: { enabled: false },
      },
    }
    assertEquals(
      // @ts-ignore - accessing private method for testing
      configInstance.isValidConfig(validConfig),
      true,
      'Valid config should pass validation',
    )

    // Missing required top-level key
    const missingKeyConfig = { ...validConfig }
    // @ts-ignore - accessing private method for testing
    delete missingKeyConfig.initialized
    assertEquals(
      // @ts-ignore - accessing private method for testing
      configInstance.isValidConfig(missingKeyConfig),
      false,
      'Config missing required key should fail validation',
    )

    // Missing nested key in dirs
    const missingNestedKeyConfig = {
      ...validConfig,
      dirs: { config: '.llemonstack', repos: 'repos', shared: 'shared' }, // missing import
    }
    assertEquals(
      // @ts-ignore - accessing private method for testing
      configInstance.isValidConfig(missingNestedKeyConfig),
      false,
      'Config missing nested key should fail validation',
    )

    // Null config
    assertEquals(
      // @ts-ignore - accessing private method for testing
      configInstance.isValidConfig(null),
      false,
      'Null config should fail validation',
    )

    // Dirs is not an object
    const invalidDirsConfig = {
      ...validConfig,
      dirs: 'not an object',
    }
    assertEquals(
      // @ts-ignore - accessing private method for testing
      configInstance.isValidConfig(invalidDirsConfig),
      false,
      'Config with non-object dirs should fail validation',
    )
  })

  await t.step('updateConfig merges template with current config', () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()

    // Set up an incomplete project config
    // @ts-ignore - accessing private property for testing
    configInstance._config = {
      initialized: '2025-00-00T00:00:00.000Z',
      version: '0.1.0',
      projectName: 'custom-project',
      envFile: '.env.custom',
      // @ts-ignore - missing dirs
      dirs: {
        config: 'custom-config',
        // missing repos, shared, import
      },
    }

    const template = {
      initialized: true,
      version: VERSION,
      projectName: 'template-project',
      envFile: '.env',
      dirs: {
        config: '.llemonstack',
        repos: 'repos',
        shared: 'shared',
        import: 'import',
      },
      newField: 'new value',
    }

    // @ts-ignore - accessing private method for testing
    configInstance.updateConfig(template)

    // @ts-ignore - accessing private property for testing
    const updatedConfig = configInstance._config

    // Original values should be preserved
    assertEquals(
      updatedConfig.projectName,
      'custom-project',
      'Original projectName should be preserved',
    )
    assertEquals(updatedConfig.envFile, '.env.custom', 'Original envFile should be preserved')
    assertEquals(
      updatedConfig.dirs.config,
      'custom-config',
      'Original dirs.config should be preserved',
    )

    // Missing values should be added from template
    assertEquals(
      updatedConfig.dirs.repos,
      'repos',
      'Missing dirs.repos should be added from template',
    )
    assertEquals(
      updatedConfig.dirs.shared,
      'shared',
      'Missing dirs.shared should be added from template',
    )
    assertEquals(
      updatedConfig.dirs.import,
      'import',
      'Missing dirs.import should be added from template',
    )
    // @ts-ignore - accessing private property for testing
    assertEquals(updatedConfig.newField, 'new value', 'New field should be added from template')

    // Version should be updated to match template
    assertEquals(updatedConfig.version, VERSION, 'Version should be updated to match template')
  })

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})

Deno.test('Config project name out of sync', async (t) => {
  let saveStub: Stub

  await t.step('setup', () => {
    // Prevent tests from saving config files to disk
    // @ts-ignore - accessing private method for testConfig
    saveStub = stub(Config.prototype, 'save', () => {
      return {
        data: true,
        error: null,
        success: true,
      }
    })
  })

  await t.step(
    'set LLEMONSTACK_PROJECT_NAME env var to different value than config.json',
    async () => {
      Deno.env.set('LLEMONSTACK_PROJECT_NAME', 'test-project')
      // @ts-ignore - temporarily override for testing
      delete Config.instance
      const instance1 = Config.getInstance()
      const result = await instance1.initialize()
      assertEquals(result.success, true)
      assertEquals(result.error, null)
      assertEquals(instance1.projectName, Config.defaultProjectName)
      // Check if the warning message about project name being out of sync is present
      const warningMessage = result.messages.find(
        (msg) =>
          msg.level === 'warning' &&
          msg.message.includes(
            'Project name is out of sync in config.json and env var: LLEMONSTACK_PROJECT_NAME',
          ),
      )

      assertNotEquals(
        warningMessage,
        undefined,
        'Should have warning message about project name being out of sync',
      )

      // Check for the info message about using the config.json name
      const infoMessage = result.messages.find(
        (msg) =>
          msg.level === 'info' &&
          msg.message.includes('Using project name from config.json'),
      )

      assertNotEquals(
        infoMessage,
        undefined,
        'Should have info message about using project name from config.json',
      )
    },
  )

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})

Deno.test.ignore('Config ENV vars', async (t) => {
  let saveStub: Stub

  // Set up the stub before all tests
  await t.step('setup', () => {
    // Prevent tests from saving config files to disk
    // @ts-ignore - accessing private method for testing
    saveStub = stub(Config.prototype, 'save', () => {
      // console.log('saveStub called')
      return {
        data: true,
        error: null,
        success: true,
      }
    })
  })

  await t.step('LLEMONSTACK_DEBUG flag', () => {
    Deno.env.set('LLEMONSTACK_DEBUG', 'true')
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const instance1 = Config.getInstance()
    assertEquals(instance1.DEBUG, true)

    Deno.env.delete('LLEMONSTACK_DEBUG')
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const instance2 = Config.getInstance()
    assertEquals(instance2.DEBUG, false)
  })

  await t.step('DEBUG flag', () => {
    Deno.env.set('DEBUG', 'true')
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const instance1 = Config.getInstance()
    assertEquals(instance1.DEBUG, true)

    Deno.env.delete('DEBUG')
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const instance2 = Config.getInstance()
    assertEquals(instance2.DEBUG, false)
  })

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})
