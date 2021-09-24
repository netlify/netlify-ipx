import { createIPXHandler } from '@netlify/ipx'

export const handler = createIPXHandler({
  domains: ['images.unsplash.com']
})
