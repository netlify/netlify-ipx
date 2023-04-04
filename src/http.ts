import { join } from 'path'
import {
  createWriteStream,
  ensureDir,
  existsSync,
  unlink,
  stat,
  pathExists
} from 'fs-extra'
import fetch, { Headers } from 'node-fetch'
import { createStorage, Storage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import murmurhash from 'murmurhash'
import etag from 'etag'
import type { HandlerResponse } from '@netlify/functions'
import { Lock } from './utils'

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
  finalize: () => Promise<void>
}

export interface SourceImageOptions {
  cacheDir: string
  url: string
  requestHeaders?: Record<string, string>
  modifiers: string
  isLocal?: boolean
  requestEtag?: string
}

interface UsageTrackingItem {
  runningCount: number;
  cacheKey: string;
  lastAccess: number;
  inputCacheFile: string
  size: number
}

type UsageTracking = Record<
  string,
  UsageTrackingItem
>;

const USAGE_TRACKING_KEY = 'usage-tracking'
const trackingLock = new Lock()

async function getTracking (metadataStore: Storage): Promise<UsageTracking> {
  return ((await metadataStore.getItem(USAGE_TRACKING_KEY)) as
      | UsageTracking
      | undefined) ?? {}
}

async function markUsageStart (
  metadataStore: Storage,
  cacheKey: string,
  inputCacheFile: string
): Promise<void> {
  await trackingLock.acquire()
  try {
    const tracking = await getTracking(metadataStore)

    let usageTrackingItem = tracking[cacheKey]
    if (!usageTrackingItem) {
      tracking[cacheKey] = usageTrackingItem = {
        runningCount: 0,
        lastAccess: 0,
        size: 0,
        cacheKey,
        inputCacheFile
      }
    }

    usageTrackingItem.runningCount++
    usageTrackingItem.lastAccess = Date.now()

    await metadataStore.setItem(USAGE_TRACKING_KEY, tracking)
  } finally {
    trackingLock.release()
  }
}

async function markUsageComplete (
  metadataStore: Storage,
  cacheKey: string

) {
  await trackingLock.acquire()
  try {
    const tracking = await getTracking(metadataStore)

    const usageTrackingItem = tracking[cacheKey]
    if (usageTrackingItem) {
      usageTrackingItem.runningCount--

      if (await pathExists(usageTrackingItem.inputCacheFile)) {
        const { size } = await stat(usageTrackingItem.inputCacheFile)
        usageTrackingItem.size = size
      } else {
        // If the file doesn't exist, we can't track it
        delete tracking[cacheKey]
      }

      await metadataStore.setItem(USAGE_TRACKING_KEY, tracking)
    }
  } finally {
    trackingLock.release()
  }
}

export const CACHE_PRUNING_THRESHOLD = 50 * 1024 * 1024

async function maybePruneCache (metadataStore: Storage) {
  await trackingLock.acquire()
  try {
    const tracking = await getTracking(metadataStore)

    let totalSize = 0
    let totalSizeAvailableToPrune = 0

    const prunableItems: Array<UsageTrackingItem> = []

    for (const trackingItem of Object.values(tracking)) {
      totalSize += trackingItem.size
      if (trackingItem.runningCount === 0) {
        totalSizeAvailableToPrune += trackingItem.size
        prunableItems.push(trackingItem)
      }
    }

    const prunableItemsSortedByAccessTime = prunableItems.sort(
      (a, b) => a.lastAccess - b.lastAccess
    )

    while (
      totalSize >= CACHE_PRUNING_THRESHOLD &&
      totalSizeAvailableToPrune > 0 &&
      prunableItemsSortedByAccessTime.length > 0
    ) {
      const itemToPrune = prunableItemsSortedByAccessTime.shift()

      await metadataStore.removeItem(`source:${itemToPrune.cacheKey}`)
      await unlink(itemToPrune.inputCacheFile)

      delete tracking[itemToPrune.cacheKey]

      totalSize -= itemToPrune.size
      totalSizeAvailableToPrune -= itemToPrune.size
    }

    await metadataStore.setItem(USAGE_TRACKING_KEY, tracking)
  } finally {
    trackingLock.release()
  }
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

  await markUsageStart(metadataStore, cacheKey, inputCacheFile)
  await maybePruneCache(metadataStore)

  function finalize () {
    return markUsageComplete(metadataStore, cacheKey)
  }

  try {
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
        },
        finalize
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
      // etag returns a quoted string for some reason
      responseEtag = JSON.parse(etag(`${cacheKey}${metadata.etag || metadata.lastModified}${modifiers}`))
      if (requestEtag && (requestEtag === responseEtag)) {
        return {
          response: {
            statusCode: NOT_MODIFIED
          },
          finalize
        }
      }
    }

    if (response.status === NOT_MODIFIED) {
      return { cacheKey, responseEtag, finalize }
    }
    if (!response.ok) {
      return {
        response: {
          statusCode: isLocal ? response.status : GATEWAY_ERROR,
          body: `Source image server responsed with ${response.status} ${response.statusText}`,
          headers: {
            'Content-Type': 'text/plain'
          }
        },
        finalize
      }
    }

    const outfile = createWriteStream(inputCacheFile)
    await new Promise((resolve, reject) => {
      outfile.on('finish', resolve)
      outfile.on('error', reject)
      response.body.pipe(outfile)
    })

    return { cacheKey, responseEtag, finalize }
  } catch (e) {
    await finalize()
    throw e
  }
}
