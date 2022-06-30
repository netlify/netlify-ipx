import { join } from 'path'
import { tmpdir } from 'os'
import { createIPX, handleRequest, IPXOptions } from 'ipx'
import { builder, Handler } from '@netlify/functions'
import { parseURL } from 'ufo'
import etag from 'etag'
import { loadSourceImage } from './http'
import { decodeBase64Params, doPatternsMatchUrl, RemotePattern } from './utils'
export interface IPXHandlerOptions extends Partial<IPXOptions> {
  cacheDir?: string
  basePath?: string
  propsEncoding?: 'base64' | undefined
  bypassDomainCheck?: boolean
  remotePatterns?: RemotePattern[]
}

export function createIPXHandler ({
  cacheDir = join(tmpdir(), 'ipx-cache'),
  basePath = '/_ipx/',
  propsEncoding,
  bypassDomainCheck,
  remotePatterns,
  ...opts
}: IPXHandlerOptions = {}) {
  const ipx = createIPX({ ...opts, dir: join(cacheDir, 'cache') })
  if (!basePath.endsWith('/')) {
    basePath = `${basePath}/`
  }
  const handler: Handler = async (event, _context) => {
    const host = event.headers.host
    const protocol = event.headers['x-forwarded-proto'] || 'http'
    let domains = (opts as IPXOptions).domains || []
    const remoteURLPatterns = remotePatterns || []
    const requestEtag = event.headers['if-none-match']
    const url = event.path.replace(basePath, '')

    // eslint-disable-next-line prefer-const
    let [modifiers = '_', ...segments] = url.split('/')
    let id = decodeURIComponent(segments.join('/'))

    if (propsEncoding === 'base64') {
      const params = decodeBase64Params(url)
      if (params.error) {
        return {
          statusCode: 400,
          body: params.error
        }
      }
      id = params.id
      modifiers = params.modifiers
    }

    const requestHeaders: Record<string, string> = {}
    const isLocal = !id.startsWith('http')
    if (isLocal) {
      id = `${protocol}://${host}${id.startsWith('/') ? '' : '/'}${id}`
      if (event.headers.cookie) {
        requestHeaders.cookie = event.headers.cookie
      }
      if (event.headers.authorization) {
        requestHeaders.authorization = event.headers.authorization
      }
    } else {
      // Parse id as URL
      const parsedUrl = parseURL(id, 'https://')

      // Check host
      if (!parsedUrl.host) {
        return {
          statusCode: 403,
          body: 'Hostname is missing: ' + id
        }
      }

      if (!bypassDomainCheck) {
        let domainAllowed = false

        if (domains.length > 0) {
          if (typeof domains === 'string') {
            domains = (domains as string).split(',').map(s => s.trim())
          }

          const hosts = domains.map(domain => parseURL(domain, 'https://').host)

          if (hosts.find(host => parsedUrl.host === host)) {
            domainAllowed = true
          }
        }

        if (remoteURLPatterns.length > 0) {
          const matchingRemotePattern = remoteURLPatterns.find((remotePattern) => {
            return doPatternsMatchUrl(remotePattern, parsedUrl)
          })

          if (matchingRemotePattern) {
            domainAllowed = true
          }
        }

        if (!domainAllowed) {
          return {
            statusCode: 403,
            body: 'URL not on allowlist: ' + id
          }
        }
      }
    }

    const { response, cacheKey, responseEtag } = await loadSourceImage({
      cacheDir,
      url: id,
      requestEtag,
      modifiers,
      isLocal,
      requestHeaders
    })

    if (response) {
      return response
    }

    const res = await handleRequest(
      {
        url: `/${modifiers}/${cacheKey}`,
        headers: event.headers
      },
      ipx
    )

    const body =
      typeof res.body === 'string' ? res.body : res.body.toString('base64')

    res.headers.etag = responseEtag || etag(body)
    delete res.headers['Last-Modified']

    if (requestEtag && requestEtag === res.headers.etag) {
      return {
        statusCode: 304,
        message: 'Not Modified'
      }
    }
    return {
      statusCode: res.statusCode,
      message: res.statusMessage,
      headers: res.headers,
      isBase64Encoded: typeof res.body !== 'string',
      body
    }
  }

  return builder(handler)
}
