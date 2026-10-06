# Local SES fake for workflow email tests

Resolves [Silthus/posthog#292](https://github.com/Silthus/posthog/issues/292), part of [map #291](https://github.com/Silthus/posthog/issues/291). Researched and tested on 2026-10-06 with GPT-6.1 Sol.

## Recommendation

Use `ghcr.io/domdomegg/aws-ses-v2-local:2.10.2`, pinned to manifest digest `sha256:1c0db32e27b52d7ac7c16048e074ffc176c9aa7f117e63babd0d911c5ef8330f`, as the Compose and CI SES inbox. Put a small test-owned HTTP proxy in front of it for fault injection and complete request capture. This combination accepts the actual SESv2 Simple payload, exposes the delivered message, and proves throttle handling through the real SDK without a vendor account, activation license or auth token.

The fake alone does not validate AWS tenant/resource associations. It accepts `TenantName` but strips it during parsing. It parses configuration sets and email tags, then leaves them out of the stored email. Assert these fields against the proxy's captured JSON request. Assert recipients, reply-to, subject, both bodies and custom headers against `GET /store`. Keep AWS tenant behavior and actual mailbox delivery in the separate real-SES lane. [Send handler](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/v2/sendEmail.ts), [stored email type](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/store.ts).

## Repository facts checked

The research branch starts at upstream `master` commit `f2fe805a3518102963730dec562e99d34a478974`.

- `SES_ENDPOINT` defaults to `http://localhost:4566` and `SES_REGION` to `us-east-1` in dev/test. The examined Compose files contain no `4566` service. [Config](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/config.ts#L341), [dev Compose](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/docker-compose.dev.yml).
- `EmailService` creates a real `SESv2Client` from region and endpoint, using the default credential provider chain. Its send payload uses `Content.Simple`, with `ConfigurationSetName`, `TenantName: team-<teamId>`, `EmailTags`, feedback forwarding, optional reply-to/CC/BCC, and custom tracking, unsubscribe and `Auto-Submitted` headers. It requires a returned `MessageId`. [Constructor](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/email.service.ts#L357), [send path](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/email.service.ts#L1038).
- The installed lockfile version is `@aws-sdk/client-sesv2@3.985.0`. This exact version ran the probe. [Lockfile](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/pnpm-lock.yaml#L1525).
- Existing email tests spy on `sesV2Client.send`, including the throttle and paused outcomes. They do not prove HTTP error deserialization or fake inbox content. [Tests](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/email.service.test.ts#L193).
- The main Node integration job explicitly starts `kafka redis7 valkey-cluster clickhouse maildev dynamodb objectstorage seaweedfs` with `docker compose ... -d --wait`. Its earlier profile launch uses `docker-compose.profiles.yml` with `dev_tools,dynamodb`. A second job starts a shorter list containing `maildev`. Add SES to each job that actually runs the new tests. [CI startup](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/.github/workflows/ci-nodejs.yml#L467), [main explicit list](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/.github/workflows/ci-nodejs.yml#L551), [second list](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/.github/workflows/ci-nodejs.yml#L864).
- Compose already provides MailDev for SMTP and DynamoDB Local. MailDev is useful for its existing provider tests, but cannot receive a signed SESv2 HTTPS/HTTP request itself. [Base services](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/docker-compose.base.yml#L334), [MailDev transport](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/helpers/maildev.ts).

The map requires implementation to build on the throttle-fix branch. These source facts describe the pinned research base; the implementation lane must check its final stacked base before changing retry assertions.

## Candidate comparison

### aws-ses-v2-local 2.10.2

MIT-licensed, dedicated SES server. The upstream release workflow publishes amd64 and arm64 images to GHCR. An anonymous pull with an empty Docker config succeeded. There was no vendor account, license activation or token. The SES route still requires an AWS-shaped authorization header, which the real SDK generates using invented credentials. [License](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/LICENSE), [image publishing](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/.github/workflows/docker-image-release.yml), [HTTP routes/auth check](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/index.ts).

`GET /health-check` supports Compose readiness; `GET /store` returns emails and templates; `POST /clear-store` clears both. Simple sends preserve the fields this repository needs for delivered-message assertions, including its custom headers. Source inspection found no send-throttle/fault control. `AWS_SES_ACCOUNT` controls `GetAccount`, not `SendEmail` errors. The proxy provides deterministic faults without changing the fake. [Routes](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/index.ts), [GetAccount](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/v2/getAccount.ts).

Do not use the stale Docker Hub rebuilds as a substitute for the upstream release. Registry metadata showed `dasprid/aws-ses-v2-local:latest` at 2.3.1, last pushed in April 2024, and `kazsakai/aws-ses-v2-local:2.4.1` last pushed in November 2024. Both listed only amd64. [dasprid tags](https://hub.docker.com/v2/repositories/dasprid/aws-ses-v2-local/tags), [kazsakai tags](https://hub.docker.com/v2/repositories/kazsakai/aws-ses-v2-local/tags).

### LocalStack

Current LocalStack fails the hard no-account/token criterion. The unified image introduced in March 2026 requires authentication, including CI. The temporary bypass expired in April. Pinning an old Community image avoids authentication but loses maintenance; examined Community v4.14.0 registers SESv1, not SESv2. [Vendor release announcement](https://blog.localstack.cloud/localstack-for-aws-release-2026-03-0/), [migration options](https://blog.localstack.cloud/localstack-single-image-next-steps/), [v4.14.0 provider registry](https://github.com/localstack/localstack/blob/3d5a0c70e0fe2eb0864447c882454d33b406ba8a/plux.ini).

Current docs list SESv2 `SendEmail` coverage and an SES inspection mailbox. The plan matrix puts SESv2 above Hobby, and the chaos fault-injection API requires Enterprise. Neither current licensing nor a pinned legacy image provides this ticket's token-free SESv2 solution. [Licensing](https://docs.localstack.cloud/aws/licensing/), [SESv2 coverage](https://docs.localstack.cloud/api-coverage/v1/services/sesv2.json), [mail readback](https://docs.localstack.cloud/aws/services/ses/#retrieve-sent-emails), [chaos API](https://docs.localstack.cloud/aws/capabilities/chaos-engineering/chaos-api/). LocalStack was not run.

### Moto server 5.2.3

Moto is Apache-2.0 and provides a public server image with Compose instructions, without vendor activation. Its SESv2 handler accepts Simple and Raw. However, Simple drops `Headers`, reply-to and send metadata, and selects HTML instead of retaining both body alternatives. This misses delivered-message assertions on the repository's actual Simple send path. Switching production to Raw just to suit a fake would be the wrong tradeoff. [License](https://github.com/getmoto/moto/blob/5.2.3/LICENSE), [server instructions](https://github.com/getmoto/moto/blob/5.2.3/docs/docs/server_mode.rst), [SendEmail implementation](https://github.com/getmoto/moto/blob/5.2.3/moto/sesv2/responses.py#L22).

`GET /moto-api/data.json` can expose stored `ses.Message`/`ses.RawMessage` objects, including raw MIME for Raw sends. This is a generic model inspection API. No SESv2 fault-injection control was identified in the server API or send path; a proxy would still be needed. Moto is a fallback for Raw-focused tests, but it is less suitable here. [Model inspection](https://github.com/getmoto/moto/blob/5.2.3/moto/moto_api/_internal/responses.py#L52), [SES message models](https://github.com/getmoto/moto/blob/5.2.3/moto/ses/models.py#L74), [control routes](https://github.com/getmoto/moto/blob/5.2.3/moto/moto_api/_internal/urls.py). Moto was not run.

### Floci

Floci is a credible broader alternative, with MIT licensing and no vendor token. Examined source commit `17c99047b92b5729b356f3584513cd6ed598b8a9` accepts SESv2 Simple headers, tenant names, configuration sets and tags. Its `GET /_aws/ses` inspector exposes recipients, bodies and headers. It also implements account sending-paused behavior. [README](https://github.com/floci-io/floci/blob/17c99047b92b5729b356f3584513cd6ed598b8a9/README.md), [send controller](https://github.com/floci-io/floci/blob/17c99047b92b5729b356f3584513cd6ed598b8a9/src/main/java/io/github/hectorvent/floci/services/ses/SesSendController.java), [inspector](https://github.com/floci-io/floci/blob/17c99047b92b5729b356f3584513cd6ed598b8a9/src/main/java/io/github/hectorvent/floci/services/ses/SesInspectionController.java).

Floci may be useful if this effort later needs local tenant/configuration-set provisioning or event publishing. Those extra semantics also mean more fixture setup and more behavior to check. Its registry has multiple image variants; inspected source is not proof that an arbitrary published tag contains it. No container or throttle control was verified for Floci in this ticket. Prefer the narrower, measured SES inbox plus proxy for the agreed send-path tests; revisit Floci if resource semantics become part of the test contract.

## Error contract and retry behavior

Return SESv2 REST JSON errors at `POST /v2/email/outbound-emails`. Do not return an SESv1 XML error to the SESv2 client. The probe verified `Content-Type: application/json`, an `x-amzn-errortype` header, a `message` JSON body and the correct status deserialize into the SDK's actual exported exception classes.

- `TooManyRequestsException`: HTTP 429. This is the SESv2 operation throttle.
- `LimitExceededException`: HTTP 400. AWS documents excess instances of a resource type. It is a separate rejection case, not automatically a transient send-rate throttle.
- `SendingPausedException`: HTTP 400. AWS documents paused sending. It needs state/operator recovery, not a short pacing delay.

These statuses and meanings come from [AWS SendEmail's error contract](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html#API_SendEmail_Errors). Real SES tenant/resource associations are also described on [the same operation](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html#SES-SendEmail-request-TenantName).

Example injected response:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
x-amzn-errortype: TooManyRequestsException
x-amzn-requestid: invented-probe-request

{"message":"Invented SES error for research probe"}
```

The current repository recognizes `TooManyRequestsException` and generic `ThrottlingException` by `Error.name` as retryable. It wraps other send errors as failures. `LimitExceededException` and `SendingPausedException` must therefore be separate hard-failure test cases unless a later policy decision changes that behavior. [Classifier](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/email.service.ts#L58), [send catch](https://github.com/PostHog/posthog/blob/f2fe805a3518102963730dec562e99d34a478974/nodejs/src/cdp/services/messaging/email.service.ts#L1147).

The probe observed three HTTP attempts with default SDK retry settings for persistent 429s. A single injected 429 may be absorbed by SDK retry and never reach the queue. For queue-level tests, either configure the test process with `AWS_MAX_ATTEMPTS=1`, or hold the fault for the entire first SDK operation, including its attempts, then clear it before the queued retry. Keep one separate transport test with the production retry settings. Assert wire attempts and accepted inbox messages independently. [AWS retry settings](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

Use one ephemeral proxy per test/test worker. Match fault rules by that test's unique recipient or request marker when needed. Capture the unsigned JSON payload, not authorization headers. Forward healthy requests to the fake; faulted requests must not reach the inbox. Clear rules in teardown. Avoid a global "fail next request" rule, which can be consumed by another parallel test or one of the SDK's own attempts.

## Compose and CI placement

Implementation sketch, not an edit made by this research branch:

1. Add a reusable `ses-local` service to `docker-compose.base.yml` with the pinned upstream image and HTTP health check.
2. Extend it in `docker-compose.dev.yml`, publishing loopback `4566:8005`. This fits the existing host-process endpoint default. Containers should use `http://ses-local:8005` explicitly.
3. Include it in the appropriate profile overlay, and append `ses-local` to the explicit Node integration job's `docker compose up ... -d --wait` list. Add it to the other job only if that job consumes the new tests.
4. Give the Node test process invented AWS credentials, such as `FAKE_ACCESS_KEY` / `FAKE_SECRET_KEY`, and use its configured region. The fake container itself needs no credentials. Start a test-owned proxy on an ephemeral loopback port and pass its URL through the existing `EmailServiceConfig.sesEndpoint` seam.
5. Read accepted emails from `/store`, correlating by `MessageId` or unique recipient. Avoid `/clear-store` between parallel tests; it clears the whole inbox and templates. Global reset is safe only for an isolated service or serialized suite.

No SMTP server is required for the local SES tests. Optional `SMTP_TRANSPORT` forwarding exists, but direct fake inbox assertions avoid another asynchronous delivery step. [SMTP implementation](https://github.com/domdomegg/aws-ses-v2-local/blob/168e2d58fd02a12770a82a9606065ccae0adbc21/src/smtp.ts).

## Commands and measured proof

Commands ran from the isolated PostHog worktree through `.codex/with-flox`. Docker used an empty config directory for the anonymous pull. The image was digest-pinned; nothing was published or provisioned in AWS.

```sh
.codex/with-flox --prepare true
mkdir -p /tmp/wf292-docker-anon
.codex/with-flox env DOCKER_CONFIG=/tmp/wf292-docker-anon docker pull \
  ghcr.io/domdomegg/aws-ses-v2-local:2.10.2@sha256:1c0db32e27b52d7ac7c16048e074ffc176c9aa7f117e63babd0d911c5ef8330f
.codex/with-flox docker buildx imagetools inspect ghcr.io/domdomegg/aws-ses-v2-local:2.10.2
```

The manifest contained `linux/amd64` and `linux/arm64`. Docker image inspection reported 260,949,816 bytes for the local amd64 image. This is expanded local image size, not compressed download size. Only amd64 was executed.

Scratch `/tmp/wf292-compose.yml`:

```yaml
services:
  ses-local:
    image: ghcr.io/domdomegg/aws-ses-v2-local:2.10.2@sha256:1c0db32e27b52d7ac7c16048e074ffc176c9aa7f117e63babd0d911c5ef8330f
    ports:
      - '127.0.0.1::8005'
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:8005/health-check').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 1s
      timeout: 2s
      retries: 10
```

```sh
.codex/with-flox env DOCKER_CONFIG=/tmp/wf292-docker-anon /usr/bin/time \
  -f 'compose startup wall_seconds=%e' \
  docker compose -p wf292-research -f /tmp/wf292-compose.yml up -d --wait
.codex/with-flox docker compose -p wf292-research -f /tmp/wf292-compose.yml port ses-local 8005
.codex/with-flox node /tmp/wf292-sdk-probe.cjs
```

Observed Compose startup to healthy was **4.15 seconds**, after pulling the image. This is one local warm-image measurement, not a CI benchmark or a cold-download estimate. The assigned host port was `32769`; change the probe URL to the port Compose reports when repeating it.

The probe below ran first against a standalone container, then against the Compose container. Both runs passed:

```text
PASS success: complete wire payload, MessageId, recipients, reply-to, subject, text, HTML and four custom headers; inbox omits tenant/config/tags
PASS fault: TooManyRequestsException 429 instanceof TooManyRequestsException attempts=1
PASS fault: LimitExceededException 400 instanceof LimitExceededException attempts=1
PASS fault: SendingPausedException 400 instanceof SendingPausedException attempts=1
PASS default SDK retries: attempts=3
PASS cleared fault: next send succeeds, only accepted messages stored
```

This proves the SDK/fake/HTTP contract. It does not execute `EmailService.executeSendEmail`, the queue, or GitHub Actions. Those belong in the follow-up implementation tests.

### Reproducible SDK probe

Save this block as `/tmp/wf292-sdk-probe.cjs`, then run the command above from a prepared PostHog repository root. All addresses, bodies, tags, headers and credentials are invented.

```js
const assert = require('node:assert/strict')
const http = require('node:http')
const {
  SESv2Client,
  SendEmailCommand,
  TooManyRequestsException,
  LimitExceededException,
  SendingPausedException,
} = require(require.resolve('@aws-sdk/client-sesv2', { paths: [process.cwd() + '/nodejs'] }))
const fake = 'http://127.0.0.1:32769'
const credentials = { accessKeyId: 'FAKE_ACCESS_KEY', secretAccessKey: 'FAKE_SECRET_KEY' }
const input = {
  FromEmailAddress: '"Example sender" <sender@example.com>',
  Destination: {
    ToAddresses: ['"Example reader" <reader@example.com>'],
    CcAddresses: ['copy@example.com'],
    BccAddresses: ['blind@example.com'],
  },
  ReplyToAddresses: ['reply@example.com'],
  Content: {
    Simple: {
      Subject: { Data: 'SES research probe', Charset: 'UTF-8' },
      Body: {
        Text: { Data: 'Invented probe body', Charset: 'UTF-8' },
        Html: { Data: '<p>Invented probe body</p>', Charset: 'UTF-8' },
      },
      Headers: [
        { Name: 'X-PostHog-Tracking-Code', Value: 'invented-tracking-code' },
        { Name: 'List-Unsubscribe', Value: '<https://example.com/unsubscribe>' },
        { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
        { Name: 'Auto-Submitted', Value: 'auto-generated' },
      ],
    },
  },
  ConfigurationSetName: 'example-config-set',
  TenantName: 'team-1',
  EmailTags: [{ Name: 'ph_id', Value: 'invented-tag' }],
  FeedbackForwardingEmailAddress: 'sender@example.com',
}
let fault = null
let requests = []
const proxy = http.createServer(async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    requests.push({ path: req.url, input: JSON.parse(body.toString()) })
    if (fault) {
      res.writeHead(fault.status, {
        'content-type': 'application/json',
        'x-amzn-errortype': fault.name,
        'x-amzn-requestid': 'invented-probe-request',
      })
      res.end(JSON.stringify({ message: 'Invented SES error for research probe' }))
      return
    }
    const headers = { ...req.headers }
    delete headers.host
    const response = await fetch(fake + req.url, { method: req.method, headers, body })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})
async function main() {
  assert.equal((await fetch(fake + '/health-check')).status, 200)
  await fetch(fake + '/clear-store', { method: 'POST' })
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const endpoint = 'http://127.0.0.1:' + proxy.address().port
  const client = new SESv2Client({ endpoint, region: 'us-east-1', credentials, maxAttempts: 1 })
  const sent = await client.send(new SendEmailCommand(input))
  assert.ok(sent.MessageId)
  assert.deepEqual(requests[0].input, input)
  assert.equal(requests[0].path, '/v2/email/outbound-emails')
  const { emails } = await (await fetch(fake + '/store')).json()
  assert.equal(emails.length, 1)
  assert.equal(emails[0].messageId, sent.MessageId)
  assert.deepEqual(emails[0].destination.to, input.Destination.ToAddresses)
  assert.deepEqual(emails[0].destination.cc, input.Destination.CcAddresses)
  assert.deepEqual(emails[0].destination.bcc, input.Destination.BccAddresses)
  assert.deepEqual(emails[0].replyTo, input.ReplyToAddresses)
  assert.equal(emails[0].subject, input.Content.Simple.Subject.Data)
  assert.equal(emails[0].body.text, input.Content.Simple.Body.Text.Data)
  assert.equal(emails[0].body.html, input.Content.Simple.Body.Html.Data)
  assert.deepEqual(
    emails[0].headers,
    input.Content.Simple.Headers.map((h) => ({ name: h.Name, value: h.Value }))
  )
  assert.equal(emails[0].TenantName, undefined)
  assert.equal(emails[0].ConfigurationSetName, undefined)
  assert.equal(emails[0].EmailTags, undefined)
  console.log(
    'PASS success: complete wire payload, MessageId, recipients, reply-to, subject, text, HTML and four custom headers; inbox omits tenant/config/tags'
  )
  for (const [name, status, ErrorClass] of [
    ['TooManyRequestsException', 429, TooManyRequestsException],
    ['LimitExceededException', 400, LimitExceededException],
    ['SendingPausedException', 400, SendingPausedException],
  ]) {
    fault = { name, status }
    requests = []
    await assert.rejects(client.send(new SendEmailCommand(input)), (error) => {
      assert.ok(error instanceof ErrorClass)
      assert.equal(error.name, name)
      assert.equal(error.$metadata.httpStatusCode, status)
      assert.equal(error.$metadata.attempts, 1)
      console.log('PASS fault:', name, status, 'instanceof', ErrorClass.name, 'attempts=1')
      return true
    })
    assert.equal(requests.length, 1)
    assert.equal((await (await fetch(fake + '/store')).json()).emails.length, 1)
  }
  fault = { name: 'TooManyRequestsException', status: 429 }
  requests = []
  const defaultClient = new SESv2Client({ endpoint, region: 'us-east-1', credentials })
  await assert.rejects(defaultClient.send(new SendEmailCommand(input)), (error) => {
    assert.equal(error.$metadata.attempts, 3)
    console.log('PASS default SDK retries: attempts=' + error.$metadata.attempts)
    return true
  })
  assert.equal(requests.length, 3)
  fault = null
  await client.send(new SendEmailCommand(input))
  assert.equal((await (await fetch(fake + '/store')).json()).emails.length, 2)
  console.log('PASS cleared fault: next send succeeds, only accepted messages stored')
  client.destroy()
  defaultClient.destroy()
  await new Promise((resolve) => proxy.close(resolve))
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

## Open risks and proposed follow-ups

- Implement the pinned Compose/CI service and a test-owned fault/capture proxy, with outside-in `executeSendEmail` tests after the architecture prototype fixes the public test boundaries. Prove wire tenant/configuration/tag values and fake-inbox recipients/headers/body together.
- Add the queue round-trip case from the map: persistently throttle the first SDK operation, verify rescheduling preserves email parameters and priority, clear the fault, then verify a single accepted send. Cover paused/resource-limit errors as hard failures and keep SDK attempts distinct from queue attempts.
- Add an upgrade contract check for the pinned fake image. The metadata omission is deliberate in this plan; the fake does not prove IAM, tenant association/reputation policy, SES event delivery, DNS or mailbox arrival. Keep those in the real-SES research/provisioning lane.
- Isolate faults and mailbox reads across parallel Jest workers. Run the finished Compose integration in the actual Node CI job and check arm64 development separately. The local measurement establishes feasibility, not all runner environments.

These are handoffs to the conductor. This ticket creates no downstream issues, edits no map/dependencies, and changes no production or CI files.
