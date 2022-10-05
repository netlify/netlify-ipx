import { createIPXHandler } from '@netlify/ipx'

export const handler = createIPXHandler({
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.unsplash.com'
    }
  ],
  domains: [
    'www.netlify.com'
  ],
  localPrefix: '/img/',
  basePath: '/.netlify/builders/ipx/',
  responseHeaders: {
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Test': 'foobar'
  }
})
