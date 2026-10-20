// PROTOTYPE, throwaway. `bun run start`: runs the comparison and serves the page with the demo images.
import { compareAll } from './compare';
import { findings } from './findings';
import { buildPage } from './page';

const port = Number(process.env.PORT ?? 4528);
const page = buildPage(await compareAll(), '', findings);
const staticDir = new URL('../emails/static/', import.meta.url);

Bun.serve({
  port,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/static/')) {
      return new Response(Bun.file(new URL(pathname.slice('/static/'.length), staticDir)));
    }
    return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  },
});

console.log(`Comparison page: http://localhost:${port}`);
