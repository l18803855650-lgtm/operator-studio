# Operator Studio

**Local-first, audit-first execution console** for browser automation, media pipelines, and factory audit workflows.

> 中文一句话：这是一个偏“执行台 / 审计台”而不是纯聊天框的 Agent 控制台，重点是 **真实执行、真实留痕、真实回放**。

## What it is

Operator Studio is a Next.js + SQLite + worker-based control plane for launching structured runs and keeping an audit trail of what actually happened.

Current built-in workflow domains:

- **Browser** — DOM-first browser automation with replay artifacts
- **Media** — download/archive/probe/delivery pipelines
- **Factory** — evidence intake, prioritization, reporting, single-image + multi-image audit reasoning hooks

## Why it exists

A lot of "agent" demos can describe intent but cannot prove execution.
Operator Studio is biased toward the opposite direction:

- runs are persisted
- steps are persisted
- events are persisted
- artifacts are persisted
- replay packages are generated

That makes it suitable for scenarios where you care about **operational traceability**, not just a nice chat response.

## Current status

This repository is already beyond a static UI mockup. It currently includes:

- run launcher + run detail console
- SQLite-backed runtime state
- independent background worker
- SSE live status stream
- local admin login/session protection
- browser credential profiles
- browser action DSL
- browser login/MFA/TOTP support hooks
- media download/archive/probe/delivery flow
- factory audit evidence/report flow
- markdown / html / pptx exports
- replay packages
- smoke verification covering real end-to-end flows

## Core capabilities

### 1. Browser execution

- Chromium + Playwright based executor
- artifacts: screenshot / html / summary json / action log / download files / replay.zip
- DOM action DSL including:
  - `waitForSelector`
  - `waitForUrl`
  - `waitForLoadState`
  - `click`
  - `fill`
  - `fillSecret`
  - `fillTotp`
  - `press`
  - `select`
  - `check`
  - `uncheck`
  - `hover`
  - `scroll`
  - `screenshot`
  - `extractText`
  - `goto`
  - `assertExists`
  - `assertText`
  - `assertValue`
  - `assertUrlIncludes`
  - `clickNewPage`
  - `switchPage`
  - `closePage`
  - `download`
  - `saveStorageState`
  - `saveProfileStorageState`

### 2. Browser credential profiles

Reusable profile fields:

- headers
- cookies
- basic auth
- locale
- user agent
- storage state path
- secrets
- TOTP config

This is designed for cases like:

- multi-step login forms
- OTP/TOTP pages
- session reuse
- saving browser state back into a known profile path

### 3. Media pipeline

- URL or local-file input
- authenticated download support
- archive + ffprobe
- manifest generation
- optional preview frame extraction
- local delivery directory
- webhook delivery with retry
- replay package

### 4. Factory audit pipeline

- intake from evidence directory / files
- metadata indexing (mime / size / sha256 / image info)
- structured findings + checklist
- standards mapping / prioritization
- html / markdown / pptx export
- single-image vision webhook hook
- multi-image batch reasoning webhook hook
- replay package

## Architecture

- **Frontend / API**: Next.js 14
- **Storage**: SQLite via built-in `node:sqlite`
- **Worker**: standalone Node worker process
- **Realtime**: SSE
- **Auth**: local session auth
- **Data model**: runs / run_steps / run_events / run_artifacts / governance / browser_profiles / admin sessions

## Important security / privacy note

This project is designed so the **codebase itself does not bundle private model provider API keys by default**.

What this means in practice:

- model names shown in the UI are policy labels unless you explicitly wire real providers
- the system only calls external endpoints that **you explicitly configure**
- examples:
  - target browser URLs
  - media source URLs
  - delivery webhooks
  - vision webhooks

### Do not publish runtime data

This repository should only contain code.
Do **not** publish:

- `data/`
- sqlite databases
- artifacts / screenshots / html dumps / replay packages
- storage state files
- real browser profile secrets / cookies / TOTP material

See [SECURITY.md](./SECURITY.md) for details.

## Quick start

```bash
npm install
npm run dev
npm run worker
```

Open:

<http://127.0.0.1:3010>

If no admin account exists yet, initialize one via the login page or `POST /api/auth/bootstrap`.

## Verification

```bash
npm run smoke
# or
npm run verify
```

The smoke suite currently covers:

- auth/profile
- browser login/MFA/multipage/download
- media authenticated download + webhook retry
- factory single-image + batch-image reasoning hooks
- stop/resume control

## Environment variables

See `.env.example`:

```bash
APP_BASE_URL=http://127.0.0.1:3010
OPERATOR_DATA_DIR=./data
OPERATOR_DB_PATH=./data/operator-studio.sqlite
```

## Example: browser execution input

```json
{
  "url": "https://example.com/login",
  "waitUntil": "networkidle",
  "timeoutMs": 30000,
  "captureHtml": true,
  "captureScreenshot": true,
  "saveStorageState": true,
  "persistProfileStorageState": true,
  "credentialProfileId": "profile-uuid",
  "secrets": {
    "username": "demo",
    "password": "secret"
  },
  "totp": {
    "secret": "JBSWY3DPEHPK3PXP",
    "issuer": "Operator Studio",
    "accountName": "demo",
    "digits": 6,
    "period": 30,
    "algorithm": "SHA1"
  },
  "actions": [
    { "type": "fillSecret", "selector": "#username", "key": "username" },
    { "type": "fillSecret", "selector": "#password", "key": "password" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "waitForUrl", "expected": "/otp" },
    { "type": "waitForLoadState", "state": "networkidle" },
    { "type": "fillTotp", "selector": "#otp-code" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "saveStorageState" },
    { "type": "screenshot", "fullPage": true }
  ]
}
```

## Example: media execution input

```json
{
  "source": "https://example.com/private/demo.wav",
  "archiveName": "operator-media-demo.wav",
  "extractFrame": true,
  "sourceHeaders": {
    "x-media-auth": "token"
  },
  "sourceCookies": [
    { "name": "media_token", "value": "demo" }
  ],
  "sourceUserAgent": "operator-studio",
  "sourceRetries": 2,
  "sourceBackoffMs": 600,
  "deliveryDir": "/tmp/operator-media-delivery",
  "deliveryWebhookUrl": "https://example.com/operator-webhook",
  "deliveryWebhookHeaders": {
    "x-operator-source": "operator-studio"
  },
  "deliveryWebhookRetries": 2,
  "deliveryWebhookBackoffMs": 600,
  "emitChecksums": true
}
```

## Example: factory audit execution input

```json
{
  "site": "ESD Packaging Line",
  "lineName": "3F Packaging Station",
  "auditTitle": "ESD audit closure",
  "owner": "Manufacturing Engineering",
  "evidenceDir": "/tmp/factory-audit-evidence",
  "findings": [
    {
      "title": "Wrist strap grounding was not verified before entering the station",
      "severity": "P0",
      "standardCode": "ESD-GROUND",
      "recommendation": "Force wrist-strap testing before launch and keep a signed record."
    }
  ],
  "checklist": [
    "Station labels are clear",
    "ESD process is traceable"
  ],
  "exportDir": "/tmp/operator-factory-export",
  "exportPptx": true,
  "presentationTitle": "ESD packaging audit deck",
  "visionWebhookUrl": "https://example.com/factory-vision-single",
  "visionBatchWebhookUrl": "https://example.com/factory-vision-batch",
  "visionBatchMaxImages": 6
}
```

## Main API surface

- `GET /api/health`
- `GET /api/ready`
- `POST /api/auth/bootstrap`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/browser-profiles`
- `POST /api/browser-profiles`
- `PATCH /api/browser-profiles/:profileId`
- `DELETE /api/browser-profiles/:profileId`
- `GET /api/governance`
- `PATCH /api/governance`
- `GET /api/templates`
- `GET /api/runs`
- `POST /api/runs`
- `GET /api/runs/:runId`
- `PATCH /api/runs/:runId`
- `GET /api/runs/:runId/stream`
- `GET /api/runs/:runId/events`
- `GET /api/runs/:runId/artifacts`
- `POST /api/runs/:runId/artifacts`
- `GET /api/runs/:runId/artifacts/:artifactId`

## Current boundaries

Not pretending this is magically complete for every production environment.
Current boundaries are explicit:

- browser executor supports complex login/TOTP flows, but site-specific MFA push / SMS / CAPTCHA still need extra handling
- media executor supports download/archive/local delivery/webhook retry, but not every external delivery channel is built in yet
- factory audit supports structured reasoning hooks, but deeper domain knowledge bases and standards matching can still be improved
- local auth exists, but this is not yet a fully multi-tenant SaaS authorization model

## Roadmap ideas

- site-specific MFA push / SMS / CAPTCHA handoff
- more delivery channels for media workflows
- stronger factory standards knowledge matching
- richer role/permission model

## License

MIT
