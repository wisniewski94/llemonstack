import { assertEquals, assertExists } from 'jsr:@std/assert'
import { beforeEach, describe, it } from 'jsr:@std/testing/bdd'
import { Config, config } from './config.ts'
import * as fs from './fs.ts'

Deno.test('Config', () => {
  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = Config.getInstance()
      const instance2 = Config.getInstance()

      assertEquals(instance1, instance2)
      assertEquals(instance1, config)
    })

    describe('paths', () => {
      let configInstance: Config

      beforeEach(() => {
        configInstance = Config.getInstance()
      })

      it('should have correct repoDir path', () => {
        const expected = fs.path.join(configInstance.configDir, 'repos')
        assertEquals(configInstance.repoDir, expected)
      })

      it('should have correct servicesDir path', () => {
        const expected = fs.path.join(configInstance.configDir, 'services')
        assertEquals(configInstance.servicesDir, expected)
      })

      it('should have correct importDir path', () => {
        const expected = fs.path.join(Deno.cwd(), 'import')
        assertEquals(configInstance.importDir, expected)
      })

      it('should have correct sharedDir path', () => {
        const expected = fs.path.join(Deno.cwd(), 'shared')
        assertEquals(configInstance.sharedDir, expected)
      })
    })

    describe('initialize', () => {
      let configInstance: Config

      beforeEach(() => {
        configInstance = Config.getInstance()
      })

      it('should initialize successfully when config file exists', async () => {
        const result = await configInstance.initialize()

        assertEquals(result.success, true)
        assertExists(result.data)
        assertEquals(result.error, null)
      })

      it("should create config file from template when it doesn't exist", async () => {
        // Mock fs.readJson to simulate missing file
        const originalReadJson = fs.readJson
        fs.readJson = async () => ({
          data: null,
          error: new Deno.errors.NotFound(),
          success: false,
        })

        // Mock fs.saveJson to avoid actual file creation
        const originalSaveJson = fs.saveJson
        fs.saveJson = async () => ({
          data: true,
          error: null,
          success: true,
        })

        try {
          const result = await configInstance.initialize()
          assertEquals(result.success, true)
          assertExists(result.data)
          assertEquals(result.error, null)
        } finally {
          // Restore original functions
          fs.readJson = originalReadJson
          fs.saveJson = originalSaveJson
        }
      })

      it('should handle read errors gracefully', async () => {
        // Mock fs.readJson to simulate error
        const originalReadJson = fs.readJson
        fs.readJson = async () => ({
          data: null,
          error: new Error('Read error'),
          success: false,
        })

        try {
          const result = await configInstance.initialize()
          assertEquals(result.success, false)
          assertExists(result.error)
        } finally {
          // Restore original function
          fs.readJson = originalReadJson
        }
      })
    })

    describe('DEBUG flag', () => {
      it("should be true when LLEMONSTACK_DEBUG env is 'true'", () => {
        Deno.env.set('LLEMONSTACK_DEBUG', 'true')
        const instance = Config.getInstance()
        assertEquals(instance.DEBUG, true)
      })

      it("should be false when LLEMONSTACK_DEBUG env is not 'true'", () => {
        Deno.env.delete('LLEMONSTACK_DEBUG')
        const instance = Config.getInstance()
        assertEquals(instance.DEBUG, false)
      })
    })
  })
})
