import { createServer } from 'http'
import { join } from 'path'
import { tmpdir } from 'os'
import test from 'ava'
import { readFile, statSync, emptyDir, readdirSync } from 'fs-extra'

import { createIPXHandler } from '../src/index'
import { CACHE_PRUNING_THRESHOLD, SourceImageResult } from '../src/http'

function getHandlerContext () {
  return {
    functionName: 'ipx',
    callbackWaitsForEmptyEventLoop: false,
    functionVersion: '1',
    invokedFunctionArn: '',
    awsRequestId: '',
    logGroupName: '',
    logStreamName: '',
    memoryLimitInMB: '',
    getRemainingTimeInMillis: () => 1000,
    done: () => { },
    fail: () => { },
    succeed: () => { }
  }
}

test('source image cache pruning', async (t) => {
  const filePath = join(__dirname, '..', 'example', 'public', 'img', 'test.jpg')
  const port = 8125

  const { size } = statSync(filePath)

  const imageCountToReachThreshold = Math.floor(CACHE_PRUNING_THRESHOLD / size) + 1

  // just few more images than needed to reach threshold
  const imageTestCount = imageCountToReachThreshold + 5

  // we assert success on each tranformation + 2 assertions for cache size
  t.plan(imageTestCount + 2)

  await new Promise<void>((resolve) => {
    createServer(function (_request, response) {
      readFile(filePath, function (error, content) {
        if (error) {
          response.writeHead(500)
          response.end(
            error.toString()
          )
        } else {
          response.writeHead(200, { 'Content-Type': 'image/jpeg' })
          response.end(content)
        }
      })
    }).listen(port, () => {
      resolve()
    })
  })

  const cacheDir = join(tmpdir(), 'ipx-cache')

  await emptyDir(cacheDir)

  const handler = createIPXHandler({
    basePath: '/_ipx/',
    cacheDir,
    bypassDomainCheck: true
  })

  for (let i = 0; i < imageTestCount; i++) {
    const path = `/_ipx/w_500/${i}.jpg`
    const response = await handler(
      {
        rawUrl: `http://localhost:${port}${path}`,
        path,
        headers: {},
        rawQuery: '',
        httpMethod: 'GET',
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        multiValueHeaders: {},
        isBase64Encoded: false,
        body: null
      },
      getHandlerContext()
    )
    if (response) {
      t.is(response.statusCode, 200)
    }
  }

  const cacheSize = readdirSync(join(cacheDir, 'cache')).reduce((acc, filename) => {
    const { size } = statSync(join(cacheDir, 'cache', filename))
    return acc + size
  }, 0)

  t.is(cacheSize, imageCountToReachThreshold * size, 'cache size should be equal to number of images needed to reach threshold * image size')
  t.not(
    cacheSize,
    imageTestCount * size,
    'cache size should not be equal to number of images * image size if we exceed threshold'
  )
})

test('should add WAF headers to local images being transformed', async (t) => {
  const handler = createIPXHandler({
    basePath: '/_ipx/',
    cacheDir: '/tmp/ipx-cache',
    bypassDomainCheck: true
  }, (sourceImageOptions) => {
    t.assert(sourceImageOptions.requestHeaders && sourceImageOptions.requestHeaders['X-Nf-Waf-Bypass-Token'] === 'some token')

    return Promise.resolve({ finalize: () => { } } as SourceImageResult)
  })

  await handler(
    {
      rawUrl: 'http://localhost:3000/some-path',
      path: '/_ipx/w_500/no-file.jpg',
      headers: { 'X-Nf-Waf-Bypass-Token': 'some token' },
      rawQuery: '',
      httpMethod: 'GET',
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      body: null
    },
    getHandlerContext()
  )
})

test('should not add WAF headers to remote images being transformed', async (t) => {
  const handler = createIPXHandler({
    basePath: '/_ipx/',
    cacheDir: '/tmp/ipx-cache',
    bypassDomainCheck: true
  }, (sourceImageOptions) => {
    t.assert(sourceImageOptions.requestHeaders && sourceImageOptions.requestHeaders['X-Nf-Waf-Bypass-Token'] === undefined)

    return Promise.resolve({ finalize: () => { } } as SourceImageResult)
  })

  await handler(
    {
      rawUrl: 'http://localhost:3000/some-path',
      path: '/_ipx/w_500/https%3A%2F%2Fsome-site.com%2Fno-file.jpg',
      headers: { 'X-Nf-Waf-Bypass-Token': 'some token' },
      rawQuery: '',
      httpMethod: 'GET',
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      body: null
    },
    getHandlerContext()
  )
})
test('should not add WAF headers to local images if WAF is disabled', async (t) => {
  const handler = createIPXHandler({
    basePath: '/_ipx/',
    cacheDir: '/tmp/ipx-cache',
    bypassDomainCheck: true
  }, (sourceImageOptions) => {
    t.assert(sourceImageOptions.requestHeaders && sourceImageOptions.requestHeaders['X-Nf-Waf-Bypass-Token'] === undefined)

    return Promise.resolve({ finalize: () => { } } as SourceImageResult)
  })

  await handler(
    {
      rawUrl: 'http://localhost:3000/some-path',
      path: '/_ipx/w_500/no-file.jpg',
      headers: {},
      rawQuery: '',
      httpMethod: 'GET',
      queryStringParameters: {},
      multiValueQueryStringParameters: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      body: null
    },
    getHandlerContext()
  )
})
