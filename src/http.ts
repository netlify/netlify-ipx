import { join } from 'path'
import { createWriteStream, ensureDir, existsSync, unlink } from 'fs-extra'
import fetch, { Headers } from 'node-fetch'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import murmurhash from 'murmurhash'
import etag from 'etag'
import type { HandlerResponse } from '@netlify/functions'

interface SourceMetadata {
  etag?: string;
  lastModified?: string;
}

const NOT_MODIFIED = 304
const GATEWAY_ERROR = 502

export interface SourceImageResult {
  response?: HandlerResponse
  cacheKey?: string;
  responseEtag?: string;
}

export interface SourceImageOptions {
  cacheDir: string
  url: string
  requestHeaders?: Record<string, string>
  modifiers: string
  isLocal?: boolean
  requestEtag?: string
}

export async function loadSourceImage ({ cacheDir, url, requestEtag, modifiers, isLocal, requestHeaders = {} }: SourceImageOptions): Promise<SourceImageResult> {
  const fileCache = join(cacheDir, 'cache')
  const metadataCache = join(cacheDir, 'metadata')

  await ensureDir(fileCache)
  await ensureDir(metadataCache)

  const metadataStore = createStorage({
    driver: fsDriver({ base: metadataCache })
  })
  const cacheKey = String(murmurhash(url))
  const inputCacheFile = join(fileCache, cacheKey)

  const headers = new Headers(requestHeaders)
  let sourceMetadata: SourceMetadata | undefined
  if (existsSync(inputCacheFile)) {
    sourceMetadata = (await metadataStore.getItem(`source:${cacheKey}`)) as
        | SourceMetadata
        | undefined
    if (sourceMetadata) {
      //  Ideally use etag
      if (sourceMetadata.etag) {
        headers.set('If-None-Match', sourceMetadata.etag)
      } else if (sourceMetadata.lastModified) {
        headers.set('If-Modified-Since', sourceMetadata.lastModified)
      } else {
        // If we have neither, the cachefile is useless
        await unlink(inputCacheFile)
      }
    }
  }

  let response
  try {
    response = await fetch(url, {
      headers
    })
  } catch (e) {
    return {
      response: {
        statusCode: GATEWAY_ERROR,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: `Error loading source image: ${e.message} ${url}`
      }
    }
  }

  const sourceEtag = response.headers.get('etag')
  const sourceLastModified = response.headers.get('last-modified')
  const metadata = {
    etag: sourceEtag || sourceMetadata?.etag,
    lastModified: sourceLastModified || sourceMetadata?.lastModified
  }
  await metadataStore.setItem(`source:${cacheKey}`, metadata)
  // We try to contruct an etag without downloading or processing the image, but we need
  // either an etag or a last-modified date for the source image to do so.
  let responseEtag
  if (metadata.etag || metadata.lastModified) {
    responseEtag = etag(`${cacheKey}${metadata.etag || metadata.lastModified}${modifiers}`)
    if (requestEtag && (requestEtag === responseEtag)) {
      return {
        response: {
          statusCode: NOT_MODIFIED
        }
      }
    }
  }

  if (response.status === NOT_MODIFIED) {
    return { cacheKey, responseEtag }
  }
  if (!response.ok) {
    return {
      response: {
        statusCode: isLocal ? response.status : GATEWAY_ERROR,
        body: `Source image server responsed with ${response.status} ${response.statusText}`
      }
    }
  }

  if (!response.headers.get('content-type').startsWith('image/')) {
    return {
      response: {
        statusCode: GATEWAY_ERROR,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'Source is not an image'
      }
    }
  }

  const outfile = createWriteStream(inputCacheFile)
  await new Promise((resolve, reject) => {
    outfile.on('finish', resolve)
    outfile.on('error', reject)
    response.body.pipe(outfile)
  })
  return { cacheKey, responseEtag }
}
