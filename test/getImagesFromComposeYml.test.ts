// Test example created by Claude 3.7 Sonnet
// TODO: finish debugging this test

import { assertEquals, assertRejects } from 'jsr:@std/assert'
import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import { afterEach, beforeEach, it } from 'jsr:@std/testing/bdd'
import { assertSpyCall, spy } from 'jsr:@std/testing/mock'
import { COMPOSE_IMAGES_CACHE, getImagesFromComposeYml } from '../scripts/start.ts'

Deno.test('getImagesFromComposeYml', () => {
  const testDir = path.join(Deno.cwd(), 'test_tmp')
  const composeDir = path.join(testDir, 'docker')

  // Setup test files
  beforeEach(async () => {
    // Create test directories
    await fs.ensureDir(composeDir)

    // Reset the cache before each test
    for (const key in COMPOSE_IMAGES_CACHE) {
      delete COMPOSE_IMAGES_CACHE[key]
    }
  })

  // Clean up test files
  afterEach(async () => {
    await fs.emptyDir(testDir)
    await Deno.remove(testDir, { recursive: true })
  })

  it('should extract service images from a simple compose file', async () => {
    // Create a simple compose file
    const composeFile = path.join(composeDir, 'docker-compose.simple.yml')
    const composeContent = `
services:
  service1:
    image: image1:latest
  service2:
    image: image2:latest
`
    await Deno.writeTextFile(composeFile, composeContent)

    // Test the function
    const result = await getImagesFromComposeYml(composeFile)

    // Verify results
    assertEquals(result.length, 2)
    assertEquals(result[0].service, 'service1')
    assertEquals(result[0].image, 'image1:latest')
    assertEquals(result[1].service, 'service2')
    assertEquals(result[1].image, 'image2:latest')
  })

  it('should handle services with build configuration', async () => {
    const composeFile = path.join(composeDir, 'docker-compose.build.yml')
    const composeContent = `
services:
  service1:
    build:
      dockerfile: Dockerfile.service1
  service2:
    image: image2:latest
`
    await Deno.writeTextFile(composeFile, composeContent)

    const result = await getImagesFromComposeYml(composeFile)

    assertEquals(result.length, 2)
    assertEquals(result[0].service, 'service1')
    assertEquals(result[0].image, 'Dockerfile.service1')
    assertEquals(result[1].service, 'service2')
    assertEquals(result[1].image, 'image2:latest')
  })

  it('should handle extended services', async () => {
    // Create base compose file
    const baseComposeFile = path.join(composeDir, 'docker-compose.base.yml')
    const baseComposeContent = `
services:
  base-service:
    image: base-image:latest
`
    await Deno.writeTextFile(baseComposeFile, baseComposeContent)

    // Create extending compose file
    const extendingComposeFile = path.join(composeDir, 'docker-compose.extending.yml')
    const extendingComposeContent = `
services:
  extended-service:
    extends:
      file: ./docker-compose.base.yml
      service: base-service
`
    await Deno.writeTextFile(extendingComposeFile, extendingComposeContent)

    const result = await getImagesFromComposeYml(extendingComposeFile)

    assertEquals(result.length, 1)
    assertEquals(result[0].service, 'extended-service')
    assertEquals(result[0].image, 'base-image:latest')
  })

  it('should handle circular references gracefully', async () => {
    // Create two files that reference each other
    const composeFile1 = path.join(composeDir, 'docker-compose.circular1.yml')
    const composeContent1 = `
services:
  service1:
    extends:
      file: ./docker-compose.circular2.yml
      service: service2
`
    await Deno.writeTextFile(composeFile1, composeContent1)

    const composeFile2 = path.join(composeDir, 'docker-compose.circular2.yml')
    const composeContent2 = `
services:
  service2:
    extends:
      file: ./docker-compose.circular1.yml
      service: service1
`
    await Deno.writeTextFile(composeFile2, composeContent2)

    // Spy on console.warn to verify warning is logged
    const warnSpy = spy(console, 'warn')

    const result = await getImagesFromComposeYml(composeFile1)

    // Should not throw and should return empty array
    assertEquals(result.length, 0)
    assertSpyCall(warnSpy, 1)

    // Restore console.warn
    warnSpy.restore()
  })

  it('should use cached results when available', async () => {
    const composeFile = path.join(composeDir, 'docker-compose.cached.yml')
    const composeContent = `
services:
  service1:
    image: image1:latest
`
    await Deno.writeTextFile(composeFile, composeContent)

    // First call should read the file
    const result1 = await getImagesFromComposeYml(composeFile)

    // Modify the file (this change should not be reflected in the second call)
    const modifiedContent = `
services:
  service1:
    image: modified-image:latest
`
    await Deno.writeTextFile(composeFile, modifiedContent)

    // Second call should use the cache
    const result2 = await getImagesFromComposeYml(composeFile)

    // Results should be identical despite file change
    assertEquals(result1, result2)
    assertEquals(result2[0].image, 'image1:latest')
  })

  it('should handle non-existent files gracefully', async () => {
    const nonExistentFile = path.join(composeDir, 'non-existent.yml')

    await assertRejects(
      async () => {
        await getImagesFromComposeYml(nonExistentFile)
      },
      Error,
      'No such file or directory',
    )
  })

  it('should handle invalid YAML files gracefully', async () => {
    const invalidYamlFile = path.join(composeDir, 'invalid.yml')
    const invalidContent = `
services:
  service1:
    image: image1:latest
  invalid-indentation
    image: invalid:latest
`
    await Deno.writeTextFile(invalidYamlFile, invalidContent)

    await assertRejects(
      async () => {
        await getImagesFromComposeYml(invalidYamlFile)
      },
      Error,
    )
  })

  it('should handle compose files without services section', async () => {
    const emptyComposeFile = path.join(composeDir, 'empty.yml')
    const emptyContent = `
version: '3'
# No services defined
`
    await Deno.writeTextFile(emptyComposeFile, emptyContent)

    const result = await getImagesFromComposeYml(emptyComposeFile)

    assertEquals(result.length, 0)
  })

  it('should handle nested extends with multiple levels', async () => {
    // Create base compose file
    const baseComposeFile = path.join(composeDir, 'docker-compose.base-level.yml')
    const baseComposeContent = `
services:
  base-service:
    image: base-image:latest
`
    await Deno.writeTextFile(baseComposeFile, baseComposeContent)

    // Create mid-level compose file
    const midComposeFile = path.join(composeDir, 'docker-compose.mid-level.yml')
    const midComposeContent = `
services:
  mid-service:
    extends:
      file: ./docker-compose.base-level.yml
      service: base-service
`
    await Deno.writeTextFile(midComposeFile, midComposeContent)

    // Create top-level compose file
    const topComposeFile = path.join(composeDir, 'docker-compose.top-level.yml')
    const topComposeContent = `
services:
  top-service:
    extends:
      file: ./docker-compose.mid-level.yml
      service: mid-service
`
    await Deno.writeTextFile(topComposeFile, topComposeContent)

    const result = await getImagesFromComposeYml(topComposeFile)

    assertEquals(result.length, 1)
    assertEquals(result[0].service, 'top-service')
    assertEquals(result[0].image, 'base-image:latest')
  })

  it('should handle services with both image and extends', async () => {
    // Create base compose file
    const baseComposeFile = path.join(composeDir, 'docker-compose.base-override.yml')
    const baseComposeContent = `
services:
  base-service:
    image: base-image:latest
`
    await Deno.writeTextFile(baseComposeFile, baseComposeContent)

    // Create extending compose file with override
    const overrideComposeFile = path.join(composeDir, 'docker-compose.override.yml')
    const overrideComposeContent = `
services:
  override-service:
    extends:
      file: ./docker-compose.base-override.yml
      service: base-service
    image: override-image:latest
`
    await Deno.writeTextFile(overrideComposeFile, overrideComposeContent)

    const result = await getImagesFromComposeYml(overrideComposeFile)

    assertEquals(result.length, 1)
    assertEquals(result[0].service, 'override-service')
    assertEquals(result[0].image, 'override-image:latest')
  })
})
