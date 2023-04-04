import { EventEmitter } from 'events'
import { ParsedURL } from 'ufo'

import { makeRe } from 'micromatch'
/**
 * Support for Gatsby-style base64-encoded URLs
 */
export function decodeBase64Params (path:string) {
  const [url, transform] = path.split('/')
  if (!url || !transform) {
    return {
      error: 'Bad Request'
    }
  }
  const id = Buffer.from(url, 'base64').toString('utf8')
  // Strip the extension
  const transforms = Buffer.from(transform.split('.')[0], 'base64').toString(
    'utf8'
  )
  if (!id || !transforms) {
    return {
      error: 'Bad Request'
    }
  }
  const params = new URLSearchParams(transforms)

  //  [ipx modifier name, gatsby modifier name]
  const props = [
    ['f', 'fm'],
    ['crop', 'pos'],
    ['q', 'q']
  ]

  const modifiers: Array<string> = []
  const w = params.get('w')
  const h = params.get('h')
  if (w && h) {
    modifiers.push(`s_${w}x${h}`)
  } else {
    props.push(['w', 'w'], ['h', 'h'])
  }

  for (const [modifier, prop] of props) {
    let value = params.get(prop)
    if (value) {
      if (prop === 'pos') {
        value = value.replace(',', ' ')
      }
      modifiers.push(`${modifier}_${value}`)
    }
  }

  return { id, modifiers: modifiers.join(',') }
}

export interface RemotePattern {
  protocol?: 'http' | 'https';
  hostname: string;
  port?: string;
  pathname?: string;
}

export function doPatternsMatchUrl (remotePattern: RemotePattern, parsedUrl: ParsedURL) {
  if (remotePattern.protocol) {
    // parsedUrl.protocol contains the : after the http/https, remotePattern does not
    if (remotePattern.protocol !== parsedUrl.protocol.slice(0, -1)) {
      return false
    }
  }

  // ufo's ParsedURL doesn't separate out ports from hostname, so this formats next's RemotePattern to match that
  const hostAndPort = remotePattern.port ? `${remotePattern.hostname}:${remotePattern.port}` : remotePattern.hostname

  if (!makeRe(hostAndPort).test(parsedUrl.host)) {
    return false
  }

  if (remotePattern.pathname) {
    if (!makeRe(remotePattern.pathname).test(parsedUrl.pathname)) {
      return false
    }
  }

  return true
}

export class Lock {
  private locked = false
  private ee = new EventEmitter()

  acquire (): Promise<void> {
    return new Promise((resolve) => {
      // If nobody has the lock, take it and resolve immediately
      if (!this.locked) {
        // Safe because JS doesn't interrupt you on synchronous operations,
        // so no need for compare-and-swap or anything like that.
        this.locked = true
        return resolve()
      }

      // Otherwise, wait until somebody releases the lock and try again
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true
          this.ee.removeListener('release', tryAcquire)
          return resolve()
        }
      }
      this.ee.on('release', tryAcquire)
    })
  }

  release (): void {
    // Release the lock immediately
    this.locked = false
    setImmediate(() => this.ee.emit('release'))
  }
}
