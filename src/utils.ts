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
