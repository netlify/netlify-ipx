import test from 'ava'
import {parseURL} from 'ufo'
import {decodeBase64Params, doPatternsMatchUrl, RemotePattern} from '../src/utils'

const encodeUrlAndTransforms = (url: string = '', transforms: string = '', extension: string = '') : string => {
  const encodedUrl = Buffer.from(url).toString('base64')
  const encodedTransforms = Buffer.from(transforms).toString('base64')
  return `${encodedUrl}/${encodedTransforms}${extension}`
}

test('decodeBase64Params: returns expected response if no url is present', (t) => {
  const expectedResponse = {
    error: 'Bad Request'
  }
  
  const response = decodeBase64Params('')
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if no transform exists in path', (t) => {
  const expectedResponse = {
    error: 'Bad Request'
  }

  const encodedUrl = encodeUrlAndTransforms('/images/image.jpg', '')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test("decodeBase64Params: returns expected response if transform doesn't contain any transforms", (t) => {
  const expectedId = '/images/';
  const expectedResponse = {
    error: 'Bad Request'
  }
  
  const encodedUrl = encodeUrlAndTransforms(expectedId, '', '.ext')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains w and h', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 's_100x200'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'w=100&h=200', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains w but no h', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'w_100'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'w=100', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains h but no w', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'h_200'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'h=200', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains fm', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'f_10'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'fm=10', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains q', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'q_101'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'q=101', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains pos', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'crop_10 20'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'pos=10,20', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains multiple valid props', (t) => {
  const expectedId = '/images/image.jpg';
  const expectedResponse = {
    id: expectedId,
    modifiers: 's_100x200,f_101,crop_10 20,q_1234'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'pos=10,20&w=100&h=200&fm=101&q=1234', '.jpg')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test("doPatternsMatchUrl: returns false if protocol exists in remote pattern and it doesn't match", (t) => {
  const remotePattern : RemotePattern = {
    protocol: 'http',
    hostname: 'fail.com'
  }
  const parsedUrl = parseURL('https://fake.url/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.false(matches)
})

test("doPatternsMatchUrl: returns false if port exists in remote pattern and the full host doesn't match", (t) => {
  const remotePattern : RemotePattern = {
    hostname: 'fail.com',
    port: '3000'
  }
  const parsedUrl = parseURL('https://fake.url/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.false(matches)
})

test("doPatternsMatchUrl: returns false if port doesn't exists in remote pattern and the host doesn't match", (t) => {
  const remotePattern : RemotePattern = {
    hostname: 'fail.com',
  }
  const parsedUrl = parseURL('https://fake.url/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.false(matches)
})

test("doPatternsMatchUrl: returns false if the pathname doesn't match", (t) => {
  const remotePattern : RemotePattern = {
    protocol: 'https',
    hostname: 'fake.url',
    pathname: '/failpath'
  }
  const parsedUrl = parseURL('https://fake.url/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.false(matches)
})

test("doPatternsMatchUrl: returns true if remote pattern fully matches", (t) => {
  const remotePattern : RemotePattern = {
    protocol: 'https',
    hostname: 'fake.url',
    port: '3000',
    pathname: '/images'
  }
  const parsedUrl = parseURL('https://fake.url:3000/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.true(matches)
})

test("doPatternsMatchUrl: returns true if remote pattern fully matches without pathname", (t) => {
  const remotePattern : RemotePattern = {
    protocol: 'https',
    hostname: 'fake.url',
    port: '3000'
  }
  const parsedUrl = parseURL('https://fake.url:3000/images?w=100&h=200&fm=1234', 'https://')

  const matches = doPatternsMatchUrl(remotePattern, parsedUrl)
  
  t.true(matches)
})
