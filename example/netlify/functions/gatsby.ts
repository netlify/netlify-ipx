import { createIPXHandler } from '@netlify/ipx'

export const handler = createIPXHandler({
  domains: ['images.unsplash.com', 'wpgatsbydemo.wpengine.com'],
  propsEncoding: 'base64',
  basePath: '/_gatsby/image/'
})
