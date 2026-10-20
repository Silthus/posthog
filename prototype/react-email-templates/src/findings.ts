// PROTOTYPE, throwaway. The findings, written after running the comparison below them.
export const findings = `
<h3>What we tested</h3>
<ul>
  <li>Six templates: five React Email demo templates (MIT) and one probe with a conditional and an optional prop.</li>
  <li>Each template is sent once per path with the props a real app passes. The "Resend reference" is the same component rendered with those props, which is what Resend's SDK sends.</li>
  <li>For each path we compare the HTML the recipient gets with the reference, the bytes each send posts, the hash across renders, and what PostHog stores in the template library.</li>
  <li>PostHog is faked in memory, with PostHog's real Liquid settings and posthog-node's real content hash. No email leaves the machine, and no Resend package or API is used.</li>
</ul>
<h3>No dependency on Resend</h3>
<ul>
  <li>No path needs the <code>resend</code> SDK. A Resend user's templates import <code>react-email</code> components (MIT). They keep those imports, because the components are their own code.</li>
  <li>posthog-node needs only one thing: turn a React element into HTML. <code>src/own-render.tsx</code> does that in about 30 lines on <code>react-dom/server</code>. Its output is byte for byte the same as React Email's <code>render</code> for all six templates (<code>bun run own-render</code>).</li>
  <li>The options for posthog-node: (1) own the renderer and take <code>react-dom</code> as an optional peer dependency; (2) take <code>@react-email/render</code> (MIT) as an optional peer dependency, as Resend's SDK does; (3) accept <code>html</code> only and let the developer call render. Option 1 has no Resend package at all. The plain-text part needs an HTML-to-text step, from <code>html-to-text</code> (MIT, not Resend) or from PostHog's side.</li>
</ul>
<h3>The hybrid in plain words</h3>
<ul>
  <li>On each send, the SDK renders the email with the recipient's real props and sends that HTML, as Resend does. The recipient gets exactly what the component renders.</li>
  <li>The send also names the template: <code>template: 'welcome'</code>. Once per template version, the SDK renders the component with its sample props (<code>PreviewProps</code>) and uploads that as a "Managed by code" template, with its source path.</li>
  <li>In PostHog you see the template in the library, a preview with sample data, a link to <code>emails/welcome.tsx</code>, and every send linked back to it. A workflow can't send it, because it is a fixed sample render with no Liquid.</li>
</ul>
<h3>Is B a two-way door?</h3>
<ul>
  <li>The send route that takes inline HTML, and <code>react</code> in posthog-node, are the same in B and C. They are public API, so they are the one-way part, and both paths need them.</li>
  <li>Adding the library entry later is additive: the route and the SDK get an optional field. Old sends keep working.</li>
  <li>The catch: sends that shipped without a key stay hidden until each call site adds <code>template</code>. The SDK can't name them later, because a minifier renames components.</li>
  <li>So make the key required for React sends from the first PR. PR 1 sends inline and records the key on each send. PR 2 uploads the preview and adds the "Managed by code" link. Then PR 2 needs no change at the call sites, and nothing is ever hidden.</li>
</ul>
<h3>What the comparison shows</h3>
<p><strong>A. Render once with Liquid placeholders</strong></p>
<ul>
  <li>Pure substitution works. Koala, Dropbox and Vercel send the same text as Resend. Each send posts 170 to 460 bytes, the hash is stable across renders, and PostHog holds a real Liquid template that a workflow or the UI could send with other data.</li>
  <li>PostHog's renderer handles the escaping that <a href="https://github.com/Silthus/posthog/issues/522">#522</a> flagged. It decodes entities inside <code>{{ }}</code> before Liquid runs and escapes the output, so <code>&amp;</code> in a URL and <code>'</code> in a name come out right.</li>
  <li>A Date or array prop throws at render. Yelp's <code>Intl.DateTimeFormat</code> and Stack Overflow's <code>tips.map</code> fail on a placeholder string. Number formatting fails the same way. This failure is loud and early.</li>
  <li><strong>A conditional sends the wrong email with no error.</strong> The stored template keeps the branch that the placeholder took. In the probe, a Pro customer gets the free-plan text.</li>
  <li><strong>An optional prop makes the template depend on the call.</strong> A send with <code>coupon</code> stores a template with the coupon line. The next send without it uploads a template without the line and replaces it. From then on, a send with a coupon gets the current content, so the line is gone and the only signal is a <code>template_superseded</code> warning. Run <code>bun run optional-prop</code> to see the three sends.</li>
  <li><code>&lt;Preview&gt;</code> pads the preheader to 200 characters and counts the placeholder's length. After the fill, the padding is short (20 characters for Vercel, 17 for the probe), so body text can show in the inbox preview. This is cosmetic, and the SDK could fix it.</li>
  <li>The automatic check (substitution only? then A, otherwise C) passes the probe and sends the wrong email. It proves equality only for the PreviewProps, so a branch they never reach stays hidden. An automatic mix is not safe as a default.</li>
</ul>
<p><strong>B. Render per send</strong></p>
<ul>
  <li>Same as Resend for all six templates, and the call site is Resend's apart from the client.</li>
  <li>The send route needs inline <code>subject</code>, <code>html</code> and <code>text</code>. That reverses the template-only send of the 2026-10-16 re-chart.</li>
  <li>Each send posts the full HTML (4 to 11 KB here), and the queued send carries it.</li>
  <li>Inline HTML gets no Liquid pass, so a <code>{{</code> in a person's data stays literal (the probe's name shows this).</li>
  <li>It loses the template library entry, the preview, "Managed by code", edit with your agent, the content hash, and per-template delivery stats.</li>
</ul>
<p><strong>C. Hybrid</strong></p>
<ul>
  <li>Same as Resend for all six templates. The call site is B plus <code>template: 'welcome'</code>.</li>
  <li>The library gets an entry from the PreviewProps render with its source path, so "Managed by code", the read-only preview and edit with your agent keep working. The hash changes only when the component changes, and the upload uses the 409, upload, retry once loop that posthog-node already has for HTML files.</li>
  <li>Costs: the send route takes inline HTML next to <code>template</code>. Each send is about 120 bytes bigger than B. The SDK renders each component once more per process.</li>
  <li>The preview shows sample data, not each email: the probe's entry shows the free plan. An entry like this has no Liquid, so a workflow or the UI can't send it, and the route must refuse a send by key alone.</li>
  <li>The key must be explicit. A minifier renames <code>Component.name</code>, so the SDK can't derive the key from it.</li>
  <li><code>&lt;Preview&gt;</code> also writes a <code>&lt;title&gt;</code>. posthog-node reads the subject of an HTML file from <code>&lt;title&gt;</code>, so a React send needs an explicit <code>subject</code>, or the preheader becomes the subject.</li>
</ul>
<h3>My read</h3>
<p>Ship C as the only React path: <code>react</code> plus an optional <code>template</code>. Without <code>template</code> it is B. Keep Liquid for HTML template files, and don't ship A for React. If a team later needs a React template that a workflow sends, A can come back as an explicit opt-in that refuses Date and array props. It should never be an automatic pick.
Smallest PR order: inline content on the send route and <code>react</code>/<code>html</code> in posthog-node (B), then <code>template</code> next to inline content (C).</p>
`;
