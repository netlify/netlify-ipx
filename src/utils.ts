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
    ['width', 'w'],
    ['height', 'h'],
    ['format', 'fm']
  ]

  const modifiers: Array<string> = []

  for (const [modifier, prop] of props) {
    const value = params.get(prop)
    if (value) {
      modifiers.push(`${modifier}_${value}`)
    }
  }

  return { id, modifiers: modifiers.join(',') }
}
