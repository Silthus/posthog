# Email brand backend: run shape, storage, logo hosting, template build

Research for [Silthus/posthog#200](https://github.com/Silthus/posthog/issues/200), part of map [#198](https://github.com/Silthus/posthog/issues/198).
Line numbers are against `origin/master` at `6bf3e47fa18`.

## Answer

- **Run shape:** one synchronous DRF action that the UI awaits, with a time budget, short per-call timeouts and a short cache. `compute_repository_readiness` in Tasks already does the same tree read plus up to 20 file reads this way. Use `Priority.NORMAL`, not `BATCH`, because a person waits on the result.
- **Storage:** a new `EmailBrand(TeamScopedRootMixin, UUIDModel)` in `products/workflows/backend/models/`, with a `OneToOneField` to the team. `RootTeamMixin.save()` moves the row to the canonical team, so there is exactly one brand per project. A classic Team extension would be per environment and needs an IDOR exemption.
- **Logo:** store it server-side with `UploadedMedia.save_content(..., purpose="email")`. No browser upload is needed. PNG, JPEG, GIF and WebP are stored as they are, and ICO converts to PNG with Pillow. SVG has no rasterizer in the repo, so it needs a new dependency (`resvg-py`) or a browser canvas fallback.
- **Template:** a pure function builds a deterministic Unlayer design (JSON below), and `render_design_html` renders it. Without `UNLAYER_API_KEY` the render raises `UnlayerNotConfiguredError`. In that case the build must not fail the flow. It should open the new-template editor with the design preloaded, so the editor's own export supplies the HTML on save.
- **Egress:** `source` needs no registry. Pass `source="workflows_brand"` and add one caller line to `posthog/egress/github/README.md` "Lanes and callers" in the same PR.

## 1. Run shape

### Evidence

| Fact                                                                                                                | Pointer                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tasks repository readiness reads `GET /repos/{repo}`, then the recursive tree, then up to 20 files                  | `products/tasks/backend/repository_readiness.py:144-175`, `:233-260`                                       |
| It bounds the scan: `MAX_FILES_TO_SCAN = 20`, `SCAN_TIME_BUDGET_SECONDS = 30`, `GITHUB_REQUEST_TIMEOUT_SECONDS = 5` | `products/tasks/backend/repository_readiness.py:26-29`                                                     |
| It caches the result for 10 minutes in Redis, and `refresh=true` bypasses the cache                                 | `products/tasks/backend/repository_readiness.py:22-23`, `:366-430`                                         |
| It runs inline in a synchronous `@action` GET, with no Celery or Temporal step                                      | `products/tasks/backend/presentation/views/api.py:1143-1160`                                               |
| `GitHubIntegration.api_request` takes per-call `timeout` (default 10s), `priority` and `stream`                     | `posthog/models/github_integration_base.py:2865-2956`                                                      |
| The class default lane is `Priority.CRITICAL`, so a caller must pass its lane explicitly                            | `posthog/models/github_integration_base.py:213-218`                                                        |
| Lanes: `NORMAL` yields a small reserve, `BATCH` is shed first                                                       | `posthog/egress/limiter/policies.py:27-35`                                                                 |
| README rule: a call a person waits on runs on `NORMAL`, and deferrable background work runs on `BATCH`              | `posthog/egress/github/README.md:23-33`                                                                    |
| A denied sheddable call raises `GitHubEgressBudgetExhausted` before sending                                         | `posthog/egress/github/transport.py:28`, `posthog/models/github_integration_base.py:2878-2891` (docstring) |

### Recommendation

- One `POST .../email_brand/detect` (or GET with `repository`) that runs inline and returns the detected brand signals.
  The UI awaits one request with a loading state. There is no job id to poll.
- Copy the readiness bounds: a 5s per-call timeout, an overall budget of about 15s, a file cap of about 10, and a 10-minute cache keyed on `(team, integration, repository, head sha)`.
- Construct the client as `GitHubIntegration(integration, source="workflows_brand", priority=Priority.NORMAL)`, or use `first_for_team_repository(team_id, repo, source=..., priority=...)` (`posthog/models/integration/github.py:327-373`).
- Map `GitHubEgressBudgetExhausted` and `GitHubRateLimitError` to a retryable error the UI shows ("GitHub is busy, try again in a minute"). Do not retry in-request.
- Celery or Temporal adds a job model, polling and failure states for a call that finishes in seconds.
  Choose one only if the detection ticket shows that real repos need many more reads than the readiness scan does.

## 2. Storage

### Evidence

| Fact                                                                                                         | Pointer                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Workflows and Messaging are separate products with the same owner                                            | `products/workflows/product.yaml`, `products/messaging/product.yaml`                                                         |
| Workflows already imports Messaging's `MessageTemplate` and `render_design_html` directly                    | `products/workflows/backend/presentation/views/hog_flow.py:111-115`                                                          |
| Newer Workflows models use `TeamScopedRootMixin` with a `db_constraint=False` team FK                        | `products/workflows/backend/models/workflow_proposal.py:9`, `:43-45`; `hog_flow_revision.py:9`; `hog_flow_optimization.py:9` |
| Team extension precedent: `TeamWorkflowsConfig` with `OneToOneField(Team, primary_key=True)`                 | `products/workflows/backend/models/team_workflows_config.py:9-10`                                                            |
| Extensions are read through `get_or_create_team_extension` and suit single-product config                    | `posthog/models/team/README.md` ("When to add fields to Team vs create an extension", "Usage")                               |
| Extensions skip the fail-closed manager and need a hand-written IDOR exemption                               | `.github/scripts/check-idor-model-coverage.py:169-226`; `posthog/models/scoping/baseline_unmigrated.txt:172`                 |
| New main-DB models must use `TeamScopedRootMixin`, and CI checks it                                          | `posthog/models/scoping/README.md` ("New main-DB model")                                                                     |
| `RootTeamMixin.save()` rewrites a child environment's team to its parent, which makes the row project-scoped | `posthog/models/utils.py:400-417`, `posthog/models/scoping/root_mixin.py:38`                                                 |
| `MessageTemplate` is a plain `UUIDTModel` on the environment team                                            | `products/messaging/backend/models/message_template.py:6-23`                                                                 |

### Recommendation

```python
class EmailBrand(TeamScopedRootMixin, UUIDModel):
    team = models.OneToOneField("posthog.Team", on_delete=models.CASCADE, db_constraint=False, related_name="+")
    name, logo (FK UploadedMedia, null), primary_color, accent_color, text_color, background_color,
    font_family (JSON: label, value, url), source_repository, sources (JSON: field -> file path),
    created_by, created_at, updated_at
```

- Place it in `products/workflows/backend/models/`. The map makes the Email brand Workflows-owned, and Workflows already reaches into Messaging for templates.
- With `OneToOneField` plus the canonical rewrite, the database itself enforces "one per project".
  A Team extension gives one row per **environment**, and it needs an IDOR exemption, which is a review-only decision.
- Expose it as a singleton route (`GET/PATCH .../email_brand`), so no endpoint looks a brand up by id.
- Store the logo as an `UploadedMedia` FK, not a URL string, so the library and cleanup keep working.

## 3. Logo hosting

### Evidence

| Fact                                                                                                                                      | Pointer                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `UploadedMedia.save_content(team, created_by, file_name, content_type, content, purpose=None)` is a server-side classmethod               | `posthog/models/uploaded_media.py:164-217`                                                         |
| A non-API caller already uses it: desktop feedback                                                                                        | `products/surveys/backend/desktop_feedback.py:130`                                                 |
| `purpose="email"` puts the image in the email media library                                                                               | `posthog/models/uploaded_media.py:26-32`                                                           |
| The upload API sniffs bytes with Pillow and rejects anything not served inline                                                            | `posthog/api/uploaded_media.py:443-505`, `posthog/models/uploaded_media.py:80-99`                  |
| Inline-safe types are PNG, JPEG, GIF, WebP, AVIF and BMP. **SVG is not**, because stored SVG could run script in the app origin           | `posthog/models/uploaded_media.py:44-62`                                                           |
| `/uploaded_media/<id>` is unauthenticated and immutable-cached, so email clients can load it                                              | `posthog/urls.py:344`, `posthog/api/uploaded_media.py:129-182`                                     |
| The absolute URL is `absolute_uri("/uploaded_media/<id>")`                                                                                | `posthog/models/uploaded_media.py:135-136`                                                         |
| 4 MB upload limit in the API                                                                                                              | `posthog/api/uploaded_media.py:36`, `:449-450`                                                     |
| GitHub file reads decode as UTF-8, so a PNG or ICO raises `UnicodeDecodeError`                                                            | `posthog/models/integration/github.py:937-1001` (`get_file_entry` `:973`, `get_blob_text` `:1001`) |
| `pillow==12.3.0` and `playwright~=1.60.0` are the only image or browser dependencies. There is no cairosvg, resvg, svglib, wand or pyvips | `pyproject.toml:105`, `:189`; `uv.lock`                                                            |
| The main `Dockerfile` has no Chromium and no libcairo. Playwright screenshots go to a remote browserless service                          | `Dockerfile:419-422`, `products/exports/backend/tasks/image_exporter.py:433-449`                   |
| logo.dev is an existing egress domain, but its icon bytes may not be stored server-side (licensing)                                       | `posthog/egress/logodev/README.md` ("Budget")                                                      |

### Recommendation

1. Add a bytes reader to `GitHubIntegration`, for example `get_file_bytes(repository, path, ref)`, and make `get_file_entry`/`get_blob_text` decode on top of it. This is a boy-scout refactor, and it keeps the size checks in one place.
2. Normalize the bytes before storing them:
   - PNG, JPEG, GIF or WebP: store as they are once `sniff_image_content_type` accepts them.
   - ICO: open with Pillow, take the largest frame, and save as PNG.
   - SVG: rasterize to PNG at 2x display width (for example 320px for a 160px slot).
3. Save with `UploadedMedia.save_content(team=..., created_by=request.user, file_name="brand-logo.png", content_type="image/png", content=png_bytes, purpose="email")`. Then run the same sniff and size checks the API runs. Factor them out of `MediaViewSet.create` instead of copying them.
4. Detection should prefer raster candidates (`apple-touch-icon.png`, the largest `manifest.json` icon) over SVG. Many repos then never need rasterization.

**SVG options (pick one in the spec):**

| Option                      | Cost                                                                                                                         | Risk                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `resvg-py` (new dependency) | Prebuilt `abi3` wheels for manylinux x86_64 and aarch64, so no system libraries ([PyPI](https://pypi.org/project/resvg-py/)) | New dependency to approve. The PyPI metadata names no license, so check the repo before adding it |
| `cairosvg`                  | Needs `cairocffi`, which needs the system libcairo the image lacks                                                           | A Dockerfile change on every web image                                                            |
| Browserless via Playwright  | Already wired for exports                                                                                                    | Cloud-only, export-pool contention, seconds per call                                              |
| Browser canvas fallback     | No new dependency. Draw the SVG on a canvas, then use the existing `/media` upload with `purpose: 'email'`                   | Not headless. SVGs with external fonts or `foreignObject` render differently                      |

`resvg-py` is the smallest server-side option. If a new dependency is rejected, fall back to the browser canvas, or skip SVG logos and let the user upload one.

## 4. Template build

### Evidence

| Fact                                                                                           | Pointer                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Template content is `{templating: "liquid", email: {subject, text, html, design}}`             | `products/messaging/backend/api/message_templates.py:69-103`                                                 |
| html without design gets `build_html_wrap_design`. Design without html is rendered server-side | `products/messaging/backend/api/message_templates.py:141-173`                                                |
| A submitted html is trusted as is, because it is the visual editor's own export                | `products/messaging/backend/api/message_templates.py:79-84`, `:153-155`                                      |
| `render_design_html` POSTs to `{UNLAYER_API_BASE_URL}/v2/export/html` with a 30s timeout       | `products/messaging/backend/unlayer.py:9`, `:62-88`                                                          |
| It expands the `unsubscribe_link` custom tool to plain HTML before export                      | `products/messaging/backend/unlayer.py:16`, `:35-59`                                                         |
| `UNLAYER_API_KEY` defaults to `""`                                                             | `posthog/settings/integrations.py:200-201`                                                                   |
| Key unset: `UnlayerNotConfiguredError`, which the serializer turns into a 400                  | `products/messaging/backend/unlayer.py:68-69`, `products/messaging/backend/api/message_templates.py:158-168` |
| The Workflows email-design operations path handles it the same way (400)                       | `products/workflows/backend/presentation/views/hog_flow.py:3631-3641`                                        |
| Structural validation: unique ids, known types, and only custom tools the renderer can expand  | `products/messaging/backend/api/design_validation.py:37-79`                                                  |
| Deterministic fixed ids are the house pattern for a code-built design                          | `posthog/cdp/validation.py:167-180`                                                                          |
| `{{ unsubscribe_url }}` is injected per recipient at send time                                 | `nodejs/src/cdp/services/hog-inputs.service.ts:76-86`                                                        |
| The editor's unsubscribe tool defaults to an `<a href="{{ unsubscribe_url }}">`                | `frontend/src/scenes/hog-functions/email-templater/custom-tools/unsubscribeLinkTool.tsx:1-36`                |
| Duplicating a template sends content that already holds html, so it needs no Unlayer call      | `products/workflows/frontend/TemplateLibrary/messageTemplateLogic.ts:527-544`                                |
| The new-template editor starts from `NEW_TEMPLATE` and has no prefill hook                     | `products/workflows/frontend/TemplateLibrary/messageTemplateLogic.ts:340-355`, `:404-412`                    |

### Minimal branded starter design

This passes `validate_design` with no warnings, and `expand_custom_tools` turns the footer into plain HTML. Both were checked against this commit.
**Not checked:** a live Unlayer export, because no key was available.

```json
{
  "counters": {
    "u_row": 3,
    "u_column": 3,
    "u_content_image": 1,
    "u_content_heading": 1,
    "u_content_text": 1,
    "u_content_button": 1,
    "u_content_custom_unsubscribe_link": 1
  },
  "schemaVersion": 16,
  "body": {
    "id": "brand-starter-body",
    "headers": [],
    "footers": [],
    "rows": [
      {
        "id": "brand-starter-header-row",
        "cells": [1],
        "columns": [
          {
            "id": "brand-starter-header-column",
            "contents": [
              {
                "id": "brand-starter-logo",
                "type": "image",
                "values": {
                  "containerPadding": "32px 24px 16px",
                  "anchor": "",
                  "src": {
                    "url": "https://us.posthog.com/uploaded_media/00000000-0000-0000-0000-000000000000",
                    "width": 320,
                    "height": 80,
                    "autoWidth": false,
                    "maxWidth": "160px"
                  },
                  "textAlign": "center",
                  "altText": "Acme",
                  "action": { "name": "web", "values": { "href": "", "target": "_blank" } },
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_meta": { "htmlID": "u_content_image_1", "htmlClassNames": "u_content_image" },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true
                }
              }
            ],
            "values": {
              "_meta": { "htmlID": "u_column_1", "htmlClassNames": "u_column" },
              "border": { "borderTopWidth": "4px", "borderTopStyle": "solid", "borderTopColor": "#F54E00" },
              "padding": "0px",
              "backgroundColor": ""
            }
          }
        ],
        "values": {
          "displayCondition": null,
          "columns": false,
          "backgroundColor": "#FFFFFF",
          "columnsBackgroundColor": "",
          "backgroundImage": { "url": "", "fullWidth": true, "repeat": false, "center": true, "cover": false },
          "padding": "0px",
          "_meta": { "htmlID": "u_row_1", "htmlClassNames": "u_row" }
        }
      },
      {
        "id": "brand-starter-content-row",
        "cells": [1],
        "columns": [
          {
            "id": "brand-starter-content-column",
            "contents": [
              {
                "id": "brand-starter-heading",
                "type": "heading",
                "values": {
                  "containerPadding": "8px 24px",
                  "anchor": "",
                  "headingType": "h1",
                  "fontSize": "28px",
                  "color": "#151515",
                  "textAlign": "left",
                  "lineHeight": "120%",
                  "linkStyle": {
                    "inherit": true,
                    "linkColor": "#1D4AFF",
                    "linkHoverColor": "#1D4AFF",
                    "linkUnderline": true,
                    "linkHoverUnderline": true
                  },
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_meta": { "htmlID": "u_content_heading_1", "htmlClassNames": "u_content_heading" },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "Hi {{ person.properties.first_name | default: 'there' }}"
                }
              },
              {
                "id": "brand-starter-body-text",
                "type": "text",
                "values": {
                  "containerPadding": "8px 24px 16px",
                  "anchor": "",
                  "fontSize": "16px",
                  "color": "#151515",
                  "textAlign": "left",
                  "lineHeight": "150%",
                  "linkStyle": {
                    "inherit": true,
                    "linkColor": "#1D4AFF",
                    "linkHoverColor": "#1D4AFF",
                    "linkUnderline": true,
                    "linkHoverUnderline": true
                  },
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_meta": { "htmlID": "u_content_text_1", "htmlClassNames": "u_content_text" },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "<p>Write your message here. Keep it short and lead with what the reader gets.</p>"
                }
              },
              {
                "id": "brand-starter-cta",
                "type": "button",
                "values": {
                  "containerPadding": "8px 24px 32px",
                  "anchor": "",
                  "href": { "name": "web", "values": { "href": "https://example.com", "target": "_blank" } },
                  "buttonColors": {
                    "color": "#FFFFFF",
                    "backgroundColor": "#1D4AFF",
                    "hoverColor": "#FFFFFF",
                    "hoverBackgroundColor": "#1D4AFF"
                  },
                  "size": { "autoWidth": true, "width": "100%" },
                  "fontSize": "16px",
                  "textAlign": "left",
                  "lineHeight": "120%",
                  "padding": "12px 24px",
                  "border": {},
                  "borderRadius": "6px",
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_meta": { "htmlID": "u_content_button_1", "htmlClassNames": "u_content_button" },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "<span>Get started</span>"
                }
              }
            ],
            "values": {
              "_meta": { "htmlID": "u_column_2", "htmlClassNames": "u_column" },
              "border": {},
              "padding": "0px",
              "backgroundColor": ""
            }
          }
        ],
        "values": {
          "displayCondition": null,
          "columns": false,
          "backgroundColor": "#FFFFFF",
          "columnsBackgroundColor": "",
          "backgroundImage": { "url": "", "fullWidth": true, "repeat": false, "center": true, "cover": false },
          "padding": "0px",
          "_meta": { "htmlID": "u_row_2", "htmlClassNames": "u_row" }
        }
      },
      {
        "id": "brand-starter-footer-row",
        "cells": [1],
        "columns": [
          {
            "id": "brand-starter-footer-column",
            "contents": [
              {
                "id": "brand-starter-unsubscribe",
                "type": "custom",
                "slug": "unsubscribe_link",
                "values": {
                  "containerPadding": "16px 24px 32px",
                  "anchor": "",
                  "displayCondition": null,
                  "_meta": {
                    "htmlID": "u_content_custom_unsubscribe_link_1",
                    "htmlClassNames": "u_content_custom_unsubscribe_link"
                  },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "unsubscribe_link_content": "<p style=\"text-align: center; font-size: 12px; color: #6B6B6B;\">You get this email because you use Acme. <a href=\"{{ unsubscribe_url }}\" style=\"color: #6B6B6B; text-decoration: underline;\">Unsubscribe</a></p>"
                }
              }
            ],
            "values": {
              "_meta": { "htmlID": "u_column_3", "htmlClassNames": "u_column" },
              "border": {},
              "padding": "0px",
              "backgroundColor": ""
            }
          }
        ],
        "values": {
          "displayCondition": null,
          "columns": false,
          "backgroundColor": "#FFFFFF",
          "columnsBackgroundColor": "",
          "backgroundImage": { "url": "", "fullWidth": true, "repeat": false, "center": true, "cover": false },
          "padding": "0px",
          "_meta": { "htmlID": "u_row_3", "htmlClassNames": "u_row" }
        }
      }
    ],
    "values": {
      "backgroundColor": "#F5F5F5",
      "contentWidth": "600px",
      "contentAlign": "center",
      "fontFamily": {
        "label": "Montserrat",
        "value": "'Montserrat',sans-serif",
        "url": "https://fonts.googleapis.com/css?family=Montserrat:400,700"
      },
      "textColor": "#151515",
      "linkStyle": {
        "body": true,
        "linkColor": "#1D4AFF",
        "linkHoverColor": "#1D4AFF",
        "linkUnderline": true,
        "linkHoverUnderline": true
      },
      "preheaderText": "",
      "_meta": { "htmlID": "u_body", "htmlClassNames": "u_body" }
    }
  }
}
```

Which Email brand field fills which path (the builder's whole job):

| Brand field              | Design path                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| logo URL, intrinsic size | `rows[0].columns[0].contents[0].values.src.{url,width,height}`; `maxWidth` fixed at `160px`              |
| name                     | logo `altText`; footer sentence                                                                          |
| accent color             | header column `border.borderTopColor` (4px top band, per `design-guidelines.md:36`)                      |
| primary color            | button `buttonColors.backgroundColor` and `hoverBackgroundColor`; every `linkColor`                      |
| text color on primary    | button `buttonColors.color`: white or black, whichever passes 4.5:1 contrast (`design-guidelines.md:25`) |
| text color               | heading and text `color`; `body.values.textColor`                                                        |
| background color         | each row `backgroundColor`; body `backgroundColor` stays a neutral outer gray                            |
| font stack               | `body.values.fontFamily` as `{label, value, url?}`                                                       |

Builder rules:

- Make it a pure function `build_branded_starter_design(brand) -> dict` with fixed ids, as `build_html_wrap_design` does. Test it with `validate_design` plus snapshot assertions on the mapped paths.
- When the brand has no logo, drop the image block and its counter. Use the brand name as a heading instead.
- Content has Liquid with `| default:` fallbacks (`design-guidelines.md:47`).

### Fonts

- `EmailTemplater` passes `fonts.customFonts` (Ubuntu only) and only when `unlayerEditorProjectId` is set. That happens on Cloud or in debug, never on self-hosted (`frontend/src/scenes/hog-functions/email-templater/EmailTemplater.tsx:735-760`, `emailTemplaterLogic.tsx:538-544`).
- Unlayer font objects are `{label, value, url?, weights?}`. `url` must point at a CSS file with `@font-face`, not a font file ([Unlayer custom fonts](https://docs.unlayer.com/builder/font-management/custom-fonts)).
- Unlayer ships 15 system and 12 Google default fonts, including Open Sans, Montserrat, Lato, Raleway, Rubik, Cabin, Playfair Display and Source Sans Pro ([Unlayer default fonts](https://docs.unlayer.com/builder/font-management/default-fonts)).
- **v1 recommendation:** when the detected font matches an Unlayer default, emit that default's exact `label`, `value` and `url` (Unlayer requires an exact match, per the docs above). Otherwise emit the detected family with a web-safe fallback stack and no `url`.
  Teaching `EmailTemplater` to append the brand font to `customFonts` is a follow-up. **Unchecked:** whether the editor renders a design font that is missing from its font list.

### What happens without `UNLAYER_API_KEY`, and what the build should do

- Today, a design-only save fails with a 400 that tells an administrator to set the key. That covers local dev without the key, self-hosted, and CI.
- The MCP and AI composer create path (`products/workflows/frontend/TemplateLibrary/newTemplateHandoff.ts:5-34`) uses the same serializer. So Cloud must already have the key set. This is inferred, not checked.
- **Build behavior:**
  1. When configured, the server builds the design, renders it, and creates the `MessageTemplate` with both `design` and `html` in one call. The flow stays headless for the later onboarding embed.
  2. When `UnlayerNotConfiguredError` is raised, do not 400 the flow. Return the built design with a machine-readable code, for example `design_rendering_unavailable`. The frontend then opens the new-template editor preloaded with that design.
     The Unlayer embed exports HTML in the browser on save, which needs no server key. It works without a `projectId`, with the default fonts only.
     This needs a small prefill hook in `messageTemplateLogic` (`:340-355`, `:404-412`).
  3. Tests mock `render_design_html` at the module boundary. Unlayer is external, as the map's "how to build" note says.
- An alternative is to always open the editor preloaded and let the user's save create the template. That is one path instead of two, but the template only exists after a manual save, and the onboarding embed loses headless creation. The spec should choose.

## 5. Egress

| Fact                                                                        | Pointer                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `source` is a free-form attribution label, set per instance                 | `posthog/models/integration/github.py:364-373`, `posthog/models/github_integration_base.py:213` |
| It ends up as the `source` label on `github_integration_api_requests_total` | `posthog/egress/github/README.md:44`                                                            |
| A change to a domain's callers updates that domain's README in the same PR  | `posthog/egress/AGENTS.md:6`                                                                    |
| Caller lines live under "Lanes and callers"                                 | `posthog/egress/github/README.md:23-33`                                                         |

No code registration is needed. Add one line under "Lanes and callers", for example: "Workflows Email brand detection (`workflows_brand`) reads one repository tree and a handful of files on `NORMAL`, because a person waits on the result."
Invoke `/routing-outbound-api-calls` when writing it.

## Open risks for the spec

1. **Lane conflict with the map.** The map's hard constraints say `Priority.BATCH`, but the egress README puts user-awaited calls on `NORMAL`. On `BATCH`, detection is shed first whenever interactive demand is present, so a user would see "GitHub is busy" while the project's other GitHub features still work. This research recommends `NORMAL`, and the spec must settle it.
2. **SVG rasterization needs a dependency decision.** Choose `resvg-py` (check its license), the browser canvas fallback, or "SVG means upload your own".
3. **Two template creation paths** (server render, and the editor fallback without a key) add a branch to the UI. Consider whether self-hosted support is worth it in v1.
4. **No live Unlayer export was run** for the starter design. The first implement ticket should render it once on a key-holding environment and keep the HTML as a fixture.
5. **Local logo URLs** (`absolute_uri` on localhost) render in the editor but not in a real inbox. This only matters for manual send tests.
6. **Logo licensing:** store only the logo found in the customer's own repo. logo.dev bytes may not be stored (`posthog/egress/logodev/README.md`).
