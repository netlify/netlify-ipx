import test from 'ava'
import { filterResponseHeaders } from '../src/utils'
import { createIPXHandler } from '../src/'
import 'fs-extra'

test('should filter out blocklisted headers', (t) => {
  const ipx = createIPXHandler({
    responseHeaders: {
      'x-header-1': 'value-1',
      'x-header-2': 'value-2'
    }
  })
  const expectedHeaders = Object.freeze({
    'cache-control': 'max-age=60'
  })
  const imageHeaders = {
    'X-Forwarded-Proto': 'malicious content'
  }
  const ipxResponseHeaders = {
    'cache-control': 'max-age=60'
  }

  filterResponseHeaders(imageHeaders, ipxResponseHeaders)

  t.deepEqual(ipxResponseHeaders, expectedHeaders)
})

test('should add original headers to IPX response headers', (t) => {
  const expectedHeaders = Object.freeze({
    'X-Custom-Header': 'hello world',
    'cache-control': 'max-age=60'
  })
  const imageHeaders = {
    'X-Forwarded-Proto': 'malicious content',
    'X-Custom-Header': 'hello world'
  }
  const ipxResponseHeaders = {
    'cache-control': 'max-age=60'
  }

  filterResponseHeaders(imageHeaders, ipxResponseHeaders)

  t.deepEqual(ipxResponseHeaders, expectedHeaders)
})
