# Out of office for SOGo

Set your out-of-office reply without opening SOGo, and without a Microsoft 365
subscription.

A small self-hosted stack for Mailcow/SOGo users: an installable web app, a
stateless middleware, and no calendar of yours stored anywhere but your own
server.

## Why

SOGo has out-of-office replies, but they live behind its web interface, in a
preferences dialog most users never find. Mailcow has no API for them. This
project puts one obvious switch in front of that: a small app you install from
your browser, where you enter your mailbox address and password once, say
"away until Tuesday", and you are done.

No M365 account is involved. The optional Outlook add-in is a wrapper around the
same app for the people who happen to have one.

## Architecture

```
   installable web app            middleware (Node/TS)              your mail server
 ┌───────────────────┐   HTTPS   ┌──────────────────────┐  IMAP   ┌──────────┐
 │ https://host/ooo/ │ ────────► │ verify password      │ ──────► │ Dovecot  │
 │ React + PWA       │  Basic    │ read/write vacation  │  HTTP   ┌──────────┐
 └───────────────────┘           │ serve the app itself │ ──────► │ SOGo     │
                                 └──────────────────────┘  :20000 └──────────┘
```

- **Password is the proof.** SOGo trusts a proxy header and does not check
  passwords, so the middleware verifies every request against Dovecot first.
- **No sessions, no database.** Every request carries the credential; nothing is
  persisted server-side.
- **SOGo stays the source of truth.** The middleware writes the same
  preferences object SOGo's own UI uses, and SOGo regenerates the Sieve script,
  so both interfaces always agree.

## Quick start

```bash
git clone https://github.com/entrhopi/sogo-vacation-addin.git
cd sogo-vacation-addin
cp deploy/.env.example deploy/.env    # then edit
cd deploy && docker compose up -d
```

The container joins your Mailcow network and is routed by Traefik at
`https://<host>/ooo/`. Requirements and the exact variables are in
[`deploy/README.md`](deploy/README.md).

Then open `https://<host>/ooo/` in Chrome or Edge and install it from the address
bar. It runs in its own window from then on.

## Repository layout

| path | what |
|---|---|
| `web/` | the installable app (React + Vite, PWA manifest and service worker) |
| `server/` | middleware: IMAP verification, SOGo client, HTTP API, static hosting |
| `office/` | optional Outlook add-in manifest, points at the same web app |
| `deploy/` | compose file, Traefik labels, environment template, nginx alternative |
| `docs/` | API contract and the SOGo protocol notes from the initial spike |

## Status

Working today: read **and edit** the state from the app — on/off, date and
optional time window, custom subject, message, and the mailing-list option —
with English and German UI.

Planned, roughly in order:

1. Remember the password on the device (encrypted, never sent to a server for
   storage) so the app opens straight into the state.
2. A Thunderbird add-on using the same API, for people who never open a browser
   tab for mail.
3. Out-of-office driven by calendar entries. This is the one feature that cannot
   be stateless: it needs either an opt-in, encrypted server-side credential or a
   local agent, so it is deliberately last.

## Documentation

- [`deploy/README.md`](deploy/README.md) — installation, Traefik, updates
- [`docs/api.md`](docs/api.md) — the HTTP contract, error codes, limits
- [`docs/sogo-spike.md`](docs/sogo-spike.md) — how SOGo's vacation storage and
  Mailcow's proxy authentication actually work

## Licence

MIT, see [`LICENSE`](LICENSE).
