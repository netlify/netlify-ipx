import test from 'ava'
import {decodeBase64Params} from '../src/utils'

const encodeUrlAndTransforms = (url: string, transforms: string) : string => {
  const encodedUrl = Buffer.from(url).toString('base64')
  const encodedTransforms = Buffer.from(transforms).toString('base64')
  return `${encodedUrl}/${encodedTransforms}.ext`
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
  
  const response = decodeBase64Params('fakeUrl/')
  
  t.deepEqual(response, expectedResponse)
})

// TODO: Can id and transform ever become falsy when base64 decoding if we're passing in a string?
// Need tests for these if so

test('decodeBase64Params: returns expected response if transform contains w and h', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 's_100x200'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'w=100&h=200')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains w but no h', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'w_100'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'w=100')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains h but no w', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'h_200'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'h=200')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains fm', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'f_10'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'fm=10')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains q', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'q_101'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'q=101')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains pos', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 'crop_10 20'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'pos=10,20')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})

test('decodeBase64Params: returns expected response if transform contains multiple valid props', (t) => {
  const expectedId = 'https://fake.url';
  const expectedResponse = {
    id: expectedId,
    modifiers: 's_100x200,f_101,crop_10 20,q_1234'
  }

  const encodedUrl = encodeUrlAndTransforms(expectedId, 'pos=10,20&w=100&h=200&fm=101&q=1234')
  
  const response = decodeBase64Params(encodedUrl)
  
  t.deepEqual(response, expectedResponse)
})
