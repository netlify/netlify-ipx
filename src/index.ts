import { join } from 'path'
import { tmpdir } from 'os'
import { createIPX, handleRequest, IPXOptions } from 'ipx'
import { builder, Handler } from '@netlify/functions'
import { parseURL } from 'ufo'
import etag from 'etag'
import { loadSourceImage } from './http'

export function createIPXHandler ({
  cacheDir = join(tmpdir(), 'ipx-cache'),
  basePath = '/_ipx',
  ...opts
}: Partial<IPXOptions> & { cacheDir?: string, basePath?: string } = {}) {
  const ipx = createIPX({ ...opts, dir: join(cacheDir, 'cache') })

  const handler: Handler = async (event, _context) => {
    const host = event.headers.host
    const protocol = event.headers['x-forwarded-proto'] || 'http'
    let domains = opts.domains || []
    const requestEtag = event.headers['if-none-match']
    const url = event.path.replace(basePath, '')

    const [modifiers = '_', ...segments] = url.substr(1).split('/')
    let id = decodeURIComponent(segments.join('/'))

    const isLocal = !id.startsWith('http')
    if (isLocal) {
      id = `${protocol}://${host}${id}`
    } else {
      if (typeof domains === 'string') {
        domains = (domains as string).split(',').map(s => s.trim())
      }

      const hosts = domains.map(domain => parseURL(domain, 'https://').host)

      // Parse id as URL
      const parsedUrl = parseURL(id, 'https://')

      // Check host
      if (!parsedUrl.host) {
        return {
          statusCode: 403,
          body: 'Hostname is missing: ' + id
        }
      }
      if (!hosts.find(host => parsedUrl.host === host)) {
        return {
          statusCode: 403,
          body: 'Hostname is missing: ' + parsedUrl.host
        }
      }
    }

    const { response, cacheKey, responseEtag } = await loadSourceImage({
      cacheDir,
      url: id,
      requestEtag,
      modifiers,
      isLocal
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
