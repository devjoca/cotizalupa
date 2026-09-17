import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'CotizaLupa',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Página no encontrada</h1>
      <a href="/">Volver al inicio</a>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  )
}
