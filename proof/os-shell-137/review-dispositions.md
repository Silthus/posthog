**Adversarial review** (fresh Opus sub-agent that did not see the build, briefed with the ticket, the diff and the proof). One blocker, five should-fixes, five nits. Dispositions:

| # | Finding | Severity | Disposition |
| --- | --- | --- | --- |
| 1 | A disabled row for the previewed key does not stop intents that map to several products. Previewing LLM analytics would install Playground and Taggers through the shared `llm_analytics` intent. Cross-sell intents reach other products too. | blocker | **Fixed, design changed.** The disabled-row write is gone. A preview window's frame now carries `data-os-preview` while the app is not installed. `lib/utils/product-intents.ts`, the one path every frontend intent takes, sends nothing from such a frame (`isOsPreviewFrame`). Checked in the running app: a fresh user previewed LLM analytics for 20 s, and the list stayed at the 5 defaults ([log](https://github.com/Silthus/posthog/blob/proof/os-shell-137/proof/os-shell-137/llm-analytics-preview.txt)). |
| 2 | The gap between the GET and the PATCH can undo an install. | should-fix | **Fixed.** A preview makes no request at all. |
| 3 | A failed GET or PATCH still opened the preview, without protection. | should-fix | **Fixed.** Same reason: no request. |
| 4 | A disabled row opts the user out of suggestions for good, even after the flag is off. | should-fix | **Fixed.** A preview writes no row. |
| 5 | "Leaves nothing behind" was false, and the test filtered out the disabled row. | should-fix | **Fixed.** Now true for `UserProductList`. The test asserts that the full write list is empty, and that the layout held the window before the close. |
| 6 | The bar stays when the window navigates to another app's page. | should-fix | **Accepted.** The mark belongs to the window, so the whole window stays a sandbox: nothing in it sends intents while the app is not installed. The bar names the app the window opened for, and Install installs that app. Clearing the mark on navigation would let the next page's intents install apps. Documented in the README. |
| 7 | Install from the bar does not tell the store frame. | nit | **Accepted.** The store reloads the list when its window gets focus, and the writes are the same. |
| 8 | Outside an OS window, Preview fell back to a plain visit, and the intents then install the app. | nit | **Fixed.** Preview only shows inside an OS window (`isOsFrame`), and the router fallback is gone. |
| 9 | The Preview button has no in-flight state. | nit | **Fixed by design.** Preview sends one `postMessage` and makes no network request, so nothing is in flight. |
| 10 | The bar test did not click the bar, and there was no failure-path or sibling test. | nit | **Partly fixed.** The failure path no longer exists. The sibling case is covered by `product-intents.test.ts` (intent and cross-sell skipped from a preview frame) and by `osFrame.test.ts`. The bar click is covered by the Playwright proof, not by Jest. |
| 11 | Installed listings show Open and Remove, not Preview. | nit | **Accepted as intended.** Open already opens an installed app, so a preview adds nothing. |

Also confirmed by the reviewer: nothing runs with the flag off (`OsWindowLayer` only mounts in `OsShell`), flag- and access-gated apps cannot be previewed, a restored mark for an app whose flag turned off shows no bar, and two store windows asking for the same preview focus one window.

Remaining limit, written in the README: intents that the server records on its own, for example when a replay filter is saved or a scanner is created, can still add an app during a preview. They follow an explicit action in the app, not a visit.
