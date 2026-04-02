# Security Policy

## Scope

This repository is intended to publish the **code** for Operator Studio.
It is **not** intended to publish local runtime state, browser sessions, or production data.

## Sensitive data that must never be committed

Do **not** commit any of the following:

- `data/`
- SQLite databases and WAL/SHM files
- runtime artifacts, replay packages, screenshots, HTML dumps, downloaded files
- browser `storageState` files
- cookies, headers, `basicAuth`, `secrets`, or `totp` values from browser profiles
- `.env.local` or any file containing real credentials or webhook endpoints

## Current security model

- Admin passwords are stored hashed via `scrypt`
- Session tokens are stored as SHA-256 hashes
- Browser profile secrets are currently stored in the local SQLite database and should be treated as sensitive runtime data
- External network calls happen only when the operator explicitly configures a target URL, media source, or webhook endpoint

## API / provider model

Operator Studio does **not** bundle private provider API keys by default.
Model names shown in the UI are policy labels unless the operator explicitly wires external providers or webhooks.

## Deployment warning

This project is currently designed for trusted/local environments.
If you expose it to a public network, you should at minimum:

- change the default admin credentials
- use HTTPS and a reverse proxy
- restrict inbound access
- avoid storing real production browser secrets unless the host is trusted

## Reporting security issues

If you discover a security issue, do not publish secrets or exploit details in a public issue.
Open a private report with the maintainer first.
