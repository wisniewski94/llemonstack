import { assertEquals, assertExists, assertStrictEquals } from 'jsr:@std/assert'
import { Stub, stub } from 'jsr:@std/testing/mock'
import { Config, config } from './config.ts'
import * as fs from './fs.ts'

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
    assertEquals(configInstance.repoDir, expectedRepoDir)

    const expectedServicesDir = fs.path.join(configInstance.installDir, 'services')
    assertEquals(configInstance.servicesDir, expectedServicesDir)

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
    configInstance.configFile = '' // Try to load the configDir instead of a file

    const result = await configInstance.initialize()

    assertEquals(result.success, false, 'Success should be false')
    assertExists(result.error, 'Error should exist')
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

  await t.step('Create missing config from template', async () => {
    // @ts-ignore - temporarily override for testing
    delete Config.instance
    const configInstance = Config.getInstance()
    // @ts-ignore - temporarily override for testing
    configInstance._initialized = false
    // @ts-ignore - temporarily override for testing
    configInstance.configFile = 'some-non-existent-file.json'

    const result = await configInstance.initialize()

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

    // Valid config should include services from config.0.2.0.json
    const validConfig = {
      initialized: true,
      version: '0.2.0',
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
        "browser-use": { enabled: true },
        langfuse: { enabled: true },
        litellm: { enabled: true },
        qdrant: { enabled: true },
        dozzle: { enabled: true },
        ollama: { enabled: true, profiles: ["ollama-host"] },
        minio: { enabled: "auto" },
        redis: { enabled: "auto" },
        supabase: { enabled: "auto" },
        neo4j: { enabled: "auto" },
        clickhouse: { enabled: "auto" },
        zep: { enabled: false },
        prometheus: { enabled: false }
      }
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
      version: '0.2.0',
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
    assertEquals(updatedConfig.version, '0.2.0', 'Version should be updated to match template')
  })

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})
