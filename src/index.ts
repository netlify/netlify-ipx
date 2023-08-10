import { join } from 'path'
import { tmpdir } from 'os'
import { createIPX, handleRequest, IPXOptions } from 'ipx'
import { builder, Handler } from '@netlify/functions'
import { parseURL } from 'ufo'
import etag from 'etag'
import { loadSourceImage as defaultLoadSourceImage } from './http'
import { decodeBase64Params, doPatternsMatchUrl, RemotePattern } from './utils'

// WAF is Web Application Firewall
const WAF_BYPASS_TOKEN_HEADER = 'x-nf-waf-bypass-token'

export interface IPXHandlerOptions extends Partial<IPXOptions> {
  /**
   * Path to cache directory
   * @default os.tmpdir() /ipx-cache
   */
  cacheDir?: string
  /**
   * Base path for IPX requests
   * @default /_ipx/
   */
  basePath?: string
  propsEncoding?: 'base64' | undefined
  /**
   * Bypass domain check for remote images
   */
  bypassDomainCheck?: boolean
  /**
   * Restrict local image access to a specific prefix
   */
  localPrefix?: string
  /**
   * Patterns used to verify remote image URLs
   */
  remotePatterns?: RemotePattern[]
  /**
   * Add custom headers to response
   */
  responseHeaders?: Record<string, string>
}

const SUBREQUEST_HEADER = 'x-ipx-subrequest'

const plainText = {
  'Content-Type': 'text/plain'
}

export function createIPXHandler ({
  cacheDir = join(tmpdir(), 'ipx-cache'),
  basePath = '/_ipx/',
  propsEncoding,
  bypassDomainCheck,
  remotePatterns,
  responseHeaders,
  localPrefix,
  ...opts
}: IPXHandlerOptions = {}, loadSourceImage = defaultLoadSourceImage) {
  const ipx = createIPX({ ...opts, dir: join(cacheDir, 'cache') })
  if (!basePath.endsWith('/')) {
    basePath = `${basePath}/`
  }
  if (localPrefix && !localPrefix.startsWith('/')) {
    localPrefix = `/${localPrefix}`
  }
  const handler: Handler = async (event, _context) => {
    if (event.headers[SUBREQUEST_HEADER]) {
      // eslint-disable-next-line no-console
      console.error('Source image loop detected')
      return {
        statusCode: 400,
        body: 'Source image loop detected',
        headers: plainText
      }
    }
    let domains = (opts as IPXOptions).domains || []
    const remoteURLPatterns = remotePatterns || []
    const requestEtag = event.headers['if-none-match']
    const eventPath = event.path.replace(basePath, '')

    // eslint-disable-next-line prefer-const
    let [modifiers = '_', ...segments] = eventPath.split('/')
    let id = decodeURIComponent(segments.join('/'))

    if (propsEncoding === 'base64') {
      const params = decodeBase64Params(eventPath)
      if (params.error) {
        return {
          statusCode: 400,
          body: params.error,
          headers: plainText
        }
      }
      id = params.id
      modifiers = params.modifiers
    }

    const requestHeaders: Record<string, string> = {
      [SUBREQUEST_HEADER]: '1'
    }

    const isLocal = !id.startsWith('http://') && !id.startsWith('https://')
    if (isLocal) {
      // This header is available to all lambdas that went through WAF
      // We need to add it for local images (origin server) to be able to bypass WAF
      if (event.headers[WAF_BYPASS_TOKEN_HEADER]) {
        // eslint-disable-next-line no-console
        console.log(`WAF bypass token found, setting ${WAF_BYPASS_TOKEN_HEADER} header to load source image`)
        requestHeaders[WAF_BYPASS_TOKEN_HEADER] =
          event.headers[WAF_BYPASS_TOKEN_HEADER]
      }

      const url = new URL(event.rawUrl)
      url.pathname = id
      if (localPrefix && !url.pathname.startsWith(localPrefix)) {
        return {
          statusCode: 400,
          body: 'Invalid source image path',
          headers: plainText
        }
      }
      id = url.toString()
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
          body: 'Hostname is missing: ' + id,
          headers: plainText
        }
      }

      if (!bypassDomainCheck) {
        let domainAllowed = false

        if (domains.length > 0) {
          if (typeof domains === 'string') {
            domains = (domains as string).split(',').map(s => s.trim())
          }

          const hosts = domains.map(domain => parseURL(domain, 'https://').host)

          if (hosts.includes(parsedUrl.host)) {
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
          // eslint-disable-next-line no-console
          console.log(`URL not on allowlist. Values provided are:
            domains: ${JSON.stringify(domains)}
            remotePatterns: ${JSON.stringify(remoteURLPatterns)}
          `)
          return {
            statusCode: 403,
            body: 'URL not on allowlist: ' + id,
            headers: plainText
          }
        }
      }
    }

    const { response, cacheKey, responseEtag, finalize } = await loadSourceImage({
      cacheDir,
      url: id,
      requestEtag,
      modifiers,
      isLocal,
      requestHeaders
    })

    try {
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

      res.headers.etag = responseEtag || JSON.parse(etag(body))
      delete res.headers['Last-Modified']

      if (requestEtag && requestEtag === res.headers.etag) {
        return {
          statusCode: 304,
          message: 'Not Modified'
        }
      }

      if (responseHeaders) {
        for (const [header, value] of Object.entries(responseHeaders)) {
          res.headers[header] = value
        }
      }

      return {
        statusCode: res.statusCode,
        message: res.statusMessage,
        headers: res.headers,
        isBase64Encoded: typeof res.body !== 'string',
        body
      }
    } finally {
      await finalize()
    }
  }

  return builder(handler)
}
