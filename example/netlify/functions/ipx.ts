import { createIPXHandler } from '@netlify/ipx'

export const handler = createIPXHandler({
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'images.unsplash.com'
    }
  ],
  basePath: '/.netlify/builders/ipx/'
})
