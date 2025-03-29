import { assert, assertEquals, assertFalse } from 'jsr:@std/assert'

import {
  Observable,
  ObservableMap,
  type ObservableMapValue,
  ObservableSet,
  type ObservableSetValue,
  ObservableStruct,
  observe,
} from '../observable.ts'

type MockFn<T> = {
  called: boolean
  fn: (...args: T[]) => void
}

const mockFn = <T>(fn: (...args: T[]) => void): MockFn<T> => {
  const output = {
    called: false,
    fn: (...args: T[]) => {
      output.called = true
      fn(...args)
    },
  }
  return output
}

const assertCalled = <T>(mock: MockFn<T>) => {
  assert(mock.called)
}
const assertNotCalled = <T>(mock: MockFn<T>) => {
  assertFalse(mock.called)
}

Deno.test('Observable', async (t) => {
  await t.step({
    name: 'constructor',
    fn: () => {
      const defaultVal = 5
      const obs = new Observable(defaultVal)

      assertEquals(defaultVal, obs.value)
    },
  })
  await t.step({
    name: 'set value',
    fn: () => {
      const defaultVal = 5
      const obs = new Observable(defaultVal)
      const newVal = 10

      obs.value = newVal

      assertEquals(newVal, obs.value)
    },
  })
  await t.step({
    name: 'listen',
    fn: () => {
      const defaultVal = 5
      const obs = new Observable(defaultVal)
      const newValue = 10

      const mock = mockFn((num: number) => {
        assertEquals(num, newValue)
      })

      obs.listen(mock.fn)

      obs.value = newValue

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'unlisten',
    fn: () => {
      const defaultVal = 5
      const obs = new Observable(defaultVal)
      const newValue = 10

      const mock = mockFn((num: number) => {
        assertEquals(num, newValue)
      })

      obs.listen(mock.fn)
      obs.unlisten(mock.fn)

      obs.value = newValue

      assertNotCalled(mock)
    },
  })
  await t.step({
    name: 'dispose',
    fn: () => {
      const defaultVal = 5
      const obs = new Observable(defaultVal)
      const newValue = 10

      const mock1 = mockFn((num: number) => {
        assertEquals(num, newValue)
      })
      const mock2 = mockFn((num: number) => {
        assertEquals(num, newValue)
      })

      obs.listen(mock1.fn)
      obs.listen(mock2.fn)
      obs.dispose()

      obs.value = newValue

      assertNotCalled(mock1)
      assertNotCalled(mock2)
    },
  })
})

Deno.test('ObservableMap', async (t) => {
  await t.step({
    name: 'constructor',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)

      assertEquals(defaultVals[0][1], obs.get('foo'))
    },
  })
  await t.step({
    name: 'set value',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)
      const newVal = 20

      obs.set('foo', newVal)

      assertEquals(newVal, obs.get('foo'))
    },
  })
  await t.step({
    name: 'listen',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals[0][1])
      })

      obs.listen(mock.fn)

      obs.set('foo', newVal)

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'unlisten',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals[0][1])
      })

      obs.listen(mock.fn)
      obs.unlisten(mock.fn)

      obs.set('foo', newVal)

      assertNotCalled(mock)
    },
  })
  await t.step({
    name: 'delete',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(null, val?.newValue)
        assertEquals(val?.oldValue, defaultVals[0][1])
      })

      obs.listen(mock.fn)

      obs.delete('foo')

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'clear',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val, null)
      })

      obs.listen(mock.fn)

      obs.clear()

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'dispose',
    fn: () => {
      const defaultVals: [string, number][] = [['foo', 5], ['bar', 10]]
      const obs = new ObservableMap<string, number>(defaultVals)
      const newVal = 20

      const mock1 = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals[0][1])
      })
      const mock2 = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals[0][1])
      })

      obs.listen(mock1.fn)
      obs.listen(mock2.fn)
      obs.dispose()

      obs.set('foo', 6)

      assertNotCalled(mock1)
      assertNotCalled(mock2)
    },
  })
})

Deno.test('ObservableSet', async (t) => {
  await t.step({
    name: 'constructor',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)

      assertEquals(defaultVals[0], obs.get(0))
    },
  })
  await t.step({
    name: 'set value',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)
      const newVal = 20

      obs.add(newVal)

      assertEquals(newVal, obs.get(2))
    },
  })
  await t.step({
    name: 'listen',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableSetValue<number>) => {
        console.log(val)
        assertEquals(val?.idx, 2)
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, null)
      })

      obs.listen(mock.fn)

      obs.add(newVal)

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'unlisten',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableSetValue<number>) => {
        console.log(val)
        assertEquals(val?.idx, 2)
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, null)
      })

      obs.listen(mock.fn)
      obs.unlisten(mock.fn)

      obs.add(newVal)

      assertNotCalled(mock)
    },
  })
  await t.step({
    name: 'delete',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)

      const mock = mockFn((val: ObservableSetValue<number>) => {
        assertEquals(val?.idx, 1)
        assertEquals(null, val?.newValue)
        assertEquals(val?.oldValue, 10)
      })

      obs.listen(mock.fn)

      obs.delete(10)

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'clear',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)

      const mock = mockFn((val: ObservableSetValue<number>) => {
        assertEquals(val, null)
      })

      obs.listen(mock.fn)

      obs.clear()

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'dispose',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)

      const mock1 = mockFn((val: ObservableSetValue<number>) => {
        assertEquals(val?.idx, 1)
        assertEquals(null, val?.newValue)
        assertEquals(val?.oldValue, 10)
      })
      const mock2 = mockFn((val: ObservableSetValue<number>) => {
        assertEquals(val?.idx, 1)
        assertEquals(null, val?.newValue)
        assertEquals(val?.oldValue, 10)
      })

      obs.listen(mock1.fn)
      obs.listen(mock2.fn)
      obs.dispose()

      obs.add(6)

      assertNotCalled(mock1)
      assertNotCalled(mock2)
    },
  })
  await t.step({
    name: 'find',
    fn: () => {
      const defaultVals: number[] = [5, 10]
      const obs = new ObservableSet<number>(defaultVals)

      obs.add(6)

      const found = obs.find(10)
      const notFound = obs.find(20)

      assertEquals(found.idx, 1)
      assertEquals(found.val, 10)
      assertEquals(notFound.val, null)
    },
  })
})

Deno.test('ObservableStruct', async (t) => {
  await t.step({
    name: 'constructor',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)

      assertEquals(defaultVals.foo, obs.get('foo'))
    },
  })
  await t.step({
    name: 'set value',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)
      const newVal = 20

      obs.set('foo', newVal)

      assertEquals(newVal, obs.get('foo'))
    },
  })
  await t.step({
    name: 'listen',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals.foo)
      })

      obs.listen(mock.fn)

      obs.set('foo', newVal)

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'unlisten',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)
      const newVal = 20

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals.foo)
      })

      obs.listen(mock.fn)
      obs.unlisten(mock.fn)

      obs.set('foo', newVal)

      assertNotCalled(mock)
    },
  })
  await t.step({
    name: 'has',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)

      assert(obs.has('foo'))
      //@ts-ignore: test case
      assertFalse(obs.has('baz'))
    },
  })
  await t.step({
    name: 'delete',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(null, val?.newValue)
        assertEquals(val?.oldValue, defaultVals.foo)
      })

      obs.listen(mock.fn)

      obs.delete('foo')

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'clear',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)

      const mock = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val, null)
      })

      obs.listen(mock.fn)

      obs.clear()

      assertCalled(mock)
    },
  })
  await t.step({
    name: 'dispose',
    fn: () => {
      const defaultVals = { 'foo': 5, 'bar': 10 }
      const obs = new ObservableStruct(defaultVals)
      const newVal = 20

      const mock1 = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals.foo)
      })
      const mock2 = mockFn((val: ObservableMapValue<string, number>) => {
        assertEquals(val?.key, 'foo')
        assertEquals(newVal, val?.newValue)
        assertEquals(val?.oldValue, defaultVals.foo)
      })

      obs.listen(mock1.fn)
      obs.listen(mock2.fn)
      obs.dispose()

      obs.set('foo', 6)

      assertNotCalled(mock1)
      assertNotCalled(mock2)
    },
  })
})

Deno.test('observe', async (t) => {
  await t.step({
    name: 'can listen to observables',
    fn: () => {
      const obs1 = new Observable(0)
      const obs2 = new ObservableMap<string, number>()
      const obs3 = new ObservableSet<number>()
      const obs4 = new ObservableStruct({ foo: 0 })

      const mock = mockFn(() => {})
      const dispose = observe(mock.fn, [obs1, obs2, obs3, obs4])
      assertNotCalled(mock)

      obs1.value = 10
      assertCalled(mock)

      dispose()
      mock.called = false

      obs4.set('foo', 10)
      assertNotCalled(mock)
    },
  })
})
