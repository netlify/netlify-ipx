import { createIPXHandler } from '@netlify/ipx'

const handle = createIPXHandler({
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

export const handler = async (event, context) => {
  try {
    return await handle(event, context)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    return {
      statusCode: 500,
      body: 'Internal Server Error'
    }
  }
}
