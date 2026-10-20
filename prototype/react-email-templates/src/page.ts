// PROTOTYPE, throwaway. Builds the side-by-side comparison page from the outcomes.
import { callSites } from './call-sites';
import type { PathName, PathOutcome, ScenarioOutcome } from './compare';

const PATH_TITLES: Record<PathName, string> = {
  renderOnce: 'A. Render once',
  perSend: 'B. Per send',
  hybrid: 'C. Hybrid',
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PADDING_UNIT = 5;

function frame(html: string, assetBase: string): string {
  const withAssets = html.replaceAll('src="/static/', `src="${assetBase}/static/`);
  return `<iframe srcdoc="${escapeHtml(withAssets)}" loading="lazy"></iframe>`;
}

function verdict(path: PathOutcome): { label: string; tone: 'good' | 'bad' | 'warn' } {
  if (path.error) return { label: 'Throws at render', tone: 'bad' };
  if (!path.matchesResend) return { label: 'Sends the wrong email', tone: 'bad' };
  if ((path.previewPaddingDelta ?? 0) !== 0) return { label: 'Same text, short preheader padding', tone: 'warn' };
  return { label: 'Same as Resend', tone: 'good' };
}

function pathColumn(name: PathName, path: PathOutcome, assetBase: string): string {
  const { label, tone } = verdict(path);
  const facts = [
    path.secondSendBytes !== undefined ? `Each send posts ${path.secondSendBytes.toLocaleString('en-US')} bytes` : null,
    path.hashStableAcrossRenders !== undefined
      ? `Content hash ${path.hashStableAcrossRenders ? 'stable across renders' : 'changes on every render'}`
      : null,
    path.previewPaddingDelta
      ? `Preheader padding ${Math.abs(path.previewPaddingDelta / PADDING_UNIT)} characters short: body text can leak into the inbox preview`
      : null,
  ].filter(Boolean);
  const body = path.recipientHtml
    ? frame(path.recipientHtml, assetBase)
    : `<div class="empty"><strong>No email.</strong><code>${escapeHtml((path.error ?? '').split('\n')[0])}</code></div>`;
  return `<div class="col">
    <div class="col-head"><span>${PATH_TITLES[name]}</span><span class="badge ${tone}">${label}</span></div>
    ${body}
    ${path.difference ? `<p class="diff">${escapeHtml(path.difference)}</p>` : ''}
    <ul class="facts">${facts.map((fact) => `<li>${fact}</li>`).join('')}</ul>
  </div>`;
}

function libraryColumn(name: PathName, path: PathOutcome, assetBase: string): string {
  const stored = path.storedTemplate;
  if (!stored) {
    return `<div class="col"><div class="col-head"><span>${PATH_TITLES[name]}</span></div><div class="empty"><strong>Nothing in the library.</strong>No preview, no "Managed by code" entry, no edit with your agent, no content hash.</div></div>`;
  }
  const caption =
    stored.kind === 'liquid'
      ? 'Stored as Liquid. The UI preview shows the placeholders. A workflow or the UI could send it with other data.'
      : 'Stored as the PreviewProps render. The preview shows sample data, not what each recipient got. Only a send with inline HTML can use it.';
  return `<div class="col">
    <div class="col-head"><span>${PATH_TITLES[name]}</span><code class="hash">${stored.contentHash.slice(0, 15)}…</code></div>
    ${frame(stored.html, assetBase)}
    <p class="caption">${caption}</p>
    <details><summary>Requests</summary><pre>${escapeHtml(path.requests.join('\n'))}</pre></details>
  </div>`;
}

function scenarioSection(outcome: ScenarioOutcome, assetBase: string): string {
  const { scenario, check } = outcome;
  const paths = Object.entries(outcome.paths) as [PathName, PathOutcome][];
  const checkLine = check.substitutionOnly
    ? `The substitution check passes, so the mix picks <strong>A. Render once</strong>.`
    : `The substitution check fails (${check.reasons.map(escapeHtml).join('; ')}), so the mix picks <strong>C. Hybrid</strong>.`;
  const mixWrong = outcome.mixPicks === 'renderOnce' && !outcome.paths.renderOnce.matchesResend;
  return `<section class="scenario" id="${scenario.key}">
    <h2>${escapeHtml(scenario.title)}</h2>
    <p class="meta">${escapeHtml(scenario.origin)}. ${escapeHtml(scenario.covers)}</p>
    <pre class="jsx">${escapeHtml(scenario.jsx)}</pre>
    <p class="check ${mixWrong ? 'alert' : ''}">${checkLine}${mixWrong ? ' <strong>That pick sends the wrong email:</strong> the PreviewProps never reach the branch this send needs.' : ''}</p>
    <h3>What the recipient gets</h3>
    <div class="grid four">
      <div class="col"><div class="col-head"><span>Resend (reference)</span><span class="badge neutral">render(react)</span></div>${frame(outcome.resendHtml, assetBase)}</div>
      ${paths.map(([name, path]) => pathColumn(name, path, assetBase)).join('')}
    </div>
    <h3>What PostHog stores and shows in the template library</h3>
    <div class="grid three">${paths.map(([name, path]) => libraryColumn(name, path, assetBase)).join('')}</div>
  </section>`;
}

function matrix(outcomes: ScenarioOutcome[]): string {
  const names: PathName[] = ['renderOnce', 'perSend', 'hybrid'];
  const rows = outcomes
    .map((outcome) => {
      const cells = names
        .map((name) => {
          const { label, tone } = verdict(outcome.paths[name]);
          return `<td><span class="badge ${tone}">${label}</span></td>`;
        })
        .join('');
      const mix = verdict(outcome.paths[outcome.mixPicks]);
      return `<tr><td><a href="#${outcome.scenario.key}">${escapeHtml(outcome.scenario.title)}</a></td>${cells}<td><span class="badge ${mix.tone}">${PATH_TITLES[outcome.mixPicks]}: ${mix.label}</span></td></tr>`;
    })
    .join('');
  return `<table class="matrix"><thead><tr><th>Template</th>${names.map((name) => `<th>${PATH_TITLES[name]}</th>`).join('')}<th>Mix (check, then A or C)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildPage(outcomes: ScenarioOutcome[], assetBase: string, findings: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Prototype: React Email templates in PostHog</title>
<style>
  :root { --accent: #1d4ed8; --fg: #111827; --muted: #6b7280; --line: #e5e7eb; --bg: #fafafa; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 1600px; margin: 0 auto; padding: 32px 24px 96px; }
  h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 22px; margin: 0 0 4px; } h3 { font-size: 15px; margin: 24px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .lede { color: var(--muted); max-width: 900px; }
  .banner { background: #fff7ed; border: 1px solid #fed7aa; padding: 8px 12px; border-radius: 6px; display: inline-block; font-size: 13px; }
  .grid { display: grid; gap: 12px; } .grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); } .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .callsites { grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); }
  .card pre { white-space: pre-wrap; }
  @container (max-width: 1100px) { .grid.four, .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  main { container-type: inline-size; }
  .col, .card { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
  .col-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 8px; flex-wrap: wrap; }
  iframe { width: 100%; height: 520px; border: 1px solid var(--line); border-radius: 4px; background: #fff; }
  .empty { height: 520px; display: flex; flex-direction: column; gap: 8px; justify-content: center; align-items: center; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 4px; padding: 16px; }
  .empty code { color: #b91c1c; font-size: 12px; word-break: break-word; }
  .badge { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .good { background: #dcfce7; color: #166534; } .bad { background: #fee2e2; color: #991b1b; } .warn { background: #fef3c7; color: #92400e; } .neutral { background: #e0e7ff; color: #3730a3; }
  .facts { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
  .diff, .caption { font-size: 12px; color: var(--muted); word-break: break-word; }
  .diff { color: #991b1b; }
  pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12.5px; line-height: 1.45; margin: 0; }
  .jsx { margin: 8px 0; white-space: pre-wrap; }
  .check { background: #eff6ff; border-left: 3px solid var(--accent); padding: 8px 12px; }
  .check.alert { background: #fef2f2; border-left-color: #dc2626; }
  .scenario { margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line); }
  .meta { color: var(--muted); margin: 0; }
  .matrix { border-collapse: collapse; background: #fff; width: 100%; } .matrix td, .matrix th { border: 1px solid var(--line); padding: 8px 10px; text-align: left; font-size: 14px; }
  .card h3 { margin-top: 0; color: var(--fg); text-transform: none; letter-spacing: 0; font-size: 16px; }
  .card ul { padding-left: 18px; margin: 8px 0 0; font-size: 13.5px; }
  .findings { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 16px 24px; max-width: 1100px; }
  .findings h3 { color: var(--fg); text-transform: none; letter-spacing: 0; font-size: 17px; }
  a { color: var(--accent); }
  details summary { cursor: pointer; font-size: 13px; color: var(--muted); margin-top: 8px; }
</style></head>
<body><main>
  <span class="banner">PROTOTYPE, throwaway. Answers <a href="https://github.com/Silthus/posthog/issues/528">Silthus/posthog#528</a>.</span>
  <h1>React Email templates in PostHog: render once, per send, or hybrid?</h1>
  <p class="lede">Each template below is sent the way a Resend user sends it today, <code>react: &lt;Template {...props} /&gt;</code>, through three posthog-node sketches against an in-memory PostHog. The fake uses PostHog's real Liquid settings and the real content hash. Every email rendered here is real React Email output. The question: which path, or which mix, should posthog-node ship?</p>

  <h3>The developer's call site</h3>
  <div class="grid callsites">${callSites
    .map(
      (site) =>
        `<div class="card"><h3>${escapeHtml(site.title)}</h3><pre>${escapeHtml(site.code)}</pre><ul>${site.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>`,
    )
    .join('')}</div>
  <p class="meta">posthog-node has no <code>from</code> yet (<a href="https://github.com/Silthus/posthog/issues/522">#522</a> lists it as a gap). The call sites show it for a like-for-like read.</p>

  <h3>Results</h3>
  ${matrix(outcomes)}

  <div class="findings">${findings}</div>

  ${outcomes.map((outcome) => scenarioSection(outcome, assetBase)).join('')}
</main></body></html>`;
}
