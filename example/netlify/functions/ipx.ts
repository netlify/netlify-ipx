import { createIPXHandler } from '@netlify/ipx'

export const handler = createIPXHandler({
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.unsplash.com'
    }
  ],
  basePath: '/.netlify/builders/ipx/'
})
