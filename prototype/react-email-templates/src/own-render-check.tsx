// PROTOTYPE, throwaway. `bun run own-render`: compares the own renderer to React Email's render, byte for byte.
import { render } from 'react-email';
import { renderEmail } from './own-render';
import { scenarios } from './scenarios';

for (const scenario of scenarios) {
  const reactEmailHtml = await render(scenario.react);
  const ownHtml = await renderEmail(scenario.react);
  const verdict = ownHtml === reactEmailHtml ? 'identical' : 'DIFFERENT';
  console.log(`${scenario.title}: ${verdict} (${ownHtml.length} bytes)`);
}
