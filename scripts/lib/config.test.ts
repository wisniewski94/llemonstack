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

    const expectedServicesDir = fs.path.join(configInstance.configDir, 'services')
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
    configInstance.configFile = '' // Try to load the confiDir instead of a file

    const result = await configInstance.initialize()

    assertEquals(result.success, false, 'Success should be false')
    assertExists(result.error, 'Error should exist')
  })

  await t.step('DEBUG flag', () => {
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

  // Clean up after all tests
  await t.step('teardown', () => {
    saveStub.restore()
  })
})
