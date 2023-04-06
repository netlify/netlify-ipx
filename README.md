# Netlify Optimized Images

> On Demand image optimization for Netlify using [ipx](https://github.com/unjs/ipx).

😺 Online demo: https://netlify-ipx.netlify.app

## Usage

Add `@netlify/ipx` as `devDependency`:

```sh
# npm
npm i -D @netlify/ipx

# yarn
yarn add --dev @netlify/ipx
```

Create `netlify/functions/ipx.ts`:

```ts
import { createIPXHandler } from "@netlify/ipx";

export const handler = createIPXHandler({
  domains: ["images.unsplash.com"],
});
```

Now you can use IPX to optimize both local and remote assets ✨

Resize `/test.jpg` (in `dist`):

```html
<img src="/.netlify/functions/ipx/w_200/static/test.jpg" />
```

Resize and change format for a remote url:

```html
<img
  src="/.netlify/functions/ipx/f_webp,w_450/https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba"
/>
```

## Remote Patterns

Instead of setting an allowlist on `domains`, you may wish to use the option `remotePatterns`. This method allows wildcards in `hostname` and `pathname` segments.

`remotePatterns` is an array that contains RemotePattern objects:

```ts
remotePatterns: [
  {
    protocol: 'https' // or 'http' - not required
    hostname: 'example.com' // required
    port: '3000' // not required
    pathname: '/blog/**' // not required
  }
]
```

To use remote patterns, create `netlify/functions/ipx.ts`:

```ts
import { createIPXHandler } from "@netlify/ipx";

export const handler = createIPXHandler({
  remotePatterns: [
    {
      protocol: "https",
      hostname: "images.unsplash.com",
    },
  ],
});
```

`hostname` and `pathname` may contain wildcards:

```ts
remotePatterns: [
  {
    hostname: '*.example.com' // * = match a single path segment or subdomain
    pathname: '/blog/**' // ** = match any number of path segments or subdomains
  }
]
```

## Local development

- Clone repository
- Install dependencies with `yarn install`
- Build the project with `yarn build`
- Run netlify development server with `yarn dev`. 
- Open http://localhost:8888

## License

MIT
