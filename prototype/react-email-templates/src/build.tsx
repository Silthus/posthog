// PROTOTYPE, throwaway. `bun run build`: writes out/comparison.html, one file that loads the demo images from
// react-email's hosted demo, so it opens from disk or anywhere else.
import { compareAll } from './compare';
import { findings } from './findings';
import { buildPage } from './page';

const target = new URL('../out/comparison.html', import.meta.url);
await Bun.write(target, buildPage(await compareAll(), 'https://demo.react.email', findings));
console.log(`Wrote ${target.pathname}`);
