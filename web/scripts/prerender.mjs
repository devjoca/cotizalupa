// Runs after `vite build` and the SSR build of src/prerender.tsx. Writes static
// HTML for public pages, the /r/ shell, and the 404 page, and generates the
// sitemap from the same path list.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SITE = "https://cotizalupa.com";
const dist = "dist";
const ssrDir = "node_modules/.prerender";

const { render, renderReportShell, PRERENDER_PATHS, NOT_FOUND_PATH } = await import(
  `../${ssrDir}/prerender.js`
);
const template = await readFile(join(dist, "index.html"), "utf8");

async function write(file, { head, body }) {
  // main.tsx removes these once HeadContent takes over.
  const marked = head.replace(/<(title|meta|link|script)\b/g, "<$1 data-prerender");
  const html = template
    .replace("</head>", `${marked}</head>`)
    .replace('<div id="app"></div>', `<div id="app">${body}</div>`);
  await mkdir(dirname(join(dist, file)), { recursive: true });
  await writeFile(join(dist, file), html);
}

await write("report-shell.html", renderReportShell());
await write("404.html", await render(NOT_FOUND_PATH));
for (const path of PRERENDER_PATHS) {
  await write(path === "/" ? "index.html" : join(path, "index.html"), await render(path));
}

const urls = PRERENDER_PATHS.map((path) => `  <url><loc>${SITE}${path}</loc></url>`).join("\n");
await writeFile(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
await rm(ssrDir, { recursive: true, force: true });
