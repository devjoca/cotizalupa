import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'CotizaLupa' }],
  }),
  notFoundComponent: () => (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Página no encontrada</h1>
      <a href="/">Volver al inicio</a>
    </main>
  ),
  component: RootDocument,
})

function RootDocument() {
  return (
    <>
      {/* The prerender writes head tags into <head> itself; rendered here they
          would land inside the body markup. The client replaces, not hydrates,
          the prerendered DOM, so the difference is safe. */}
      {typeof document !== 'undefined' && <HeadContent />}
      <Outlet />
    </>
  )
}
