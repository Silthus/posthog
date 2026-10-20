// PROTOTYPE, throwaway. A renderer posthog-node could own: react-dom/server only, no package from Resend.
import { Suspense, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';

const XHTML_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

export async function renderEmail(element: ReactElement): Promise<string> {
  let renderError: unknown;
  const stream = await renderToReadableStream(<Suspense>{element}</Suspense>, {
    progressiveChunkSize: Number.POSITIVE_INFINITY,
    onError: (error) => {
      renderError = error;
    },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (renderError) {
    throw renderError;
  }
  return XHTML_DOCTYPE + withoutImagePreloads(html).replace(/<!DOCTYPE.*?>/, '');
}

function withoutImagePreloads(html: string): string {
  return html.replace(/<link\b[^>]*\/?>/gi, (tag) => (isImagePreload(tag) ? '' : tag));
}

function isImagePreload(tag: string): boolean {
  return /\brel="preload"/i.test(tag) && /\bas="image"/i.test(tag);
}
