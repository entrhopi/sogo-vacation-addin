# SOGo vacation API — spike notes (Step 0)

Status: **closed.** Auth, read and write all proven live against the test mailbox.

- Target: `https://mail.example.org/SOGo` (Mailcow, SOGo **5.12.13-1**, Angular UI)
- Internal endpoint: `http://sogo:20000` (docker network alias `sogo`, port not published)
- Test mailbox: `user@example.org` (placeholder; the original test mailbox was temporary)

Legend: *[verified live]* = confirmed against the instance · *[source]* = read from the
SOGo / Mailcow source for these exact versions · *[assumed]* = still needs confirmation.

---

## 1. Authentication — Mailcow SSO, not SOGo passwords

Mailcow runs SOGo with **`SOGoTrustProxyAuthentication = YES`**. SOGo does not verify
user passwords on this instance; nginx authenticates every request first:

```
browser ──► nginx /SOGo ──auth_request──► /sogo-auth (PHP, 127.0.0.1:65510)
                                              │ validates the Mailcow session
                                              │ X-User: <mailbox>
                                              │ X-Auth: Basic base64(<mailbox>:<pass>)
                                              │ X-Auth-Type: Basic
                                              ▼
                            sogo:20000 with  x-webobjects-remote-user: <mailbox>
                                             Authorization: Basic …
```

Consequences:

- `POST /SOGo/connect` (the SOGo login form) is **the wrong door** here. It authenticates
  against `_sogo_static_view` using `MAILCOW_PASS_SCHEME` hashes. A mailbox password that
  Dovecot accepts can legitimately fail there (`403 {"additionalInfos":{},
  "LDAPPasswordPolicyError":65535}` = bind NO, no policy detail). This was the Step-0
  blocker and is now moot.
- The `Authorization` credential is not checked by SOGo; it is used for SOGo's own
  IMAP/Sieve connections. Mailcow normally injects its SSO master password from
  `/etc/sogo-sso/sogo-sso.pass`; **the user's real password works too** *[verified live]*.
- Because SOGo blindly trusts `x-webobjects-remote-user`, **the caller is responsible for
  authenticating**. In this design that is a Dovecot IMAP `LOGIN` — the only check that
  stands between a request and someone else's mailbox.

### Proven call *[verified live]*

Three headers, all required:

| header | value |
|---|---|
| `x-webobjects-remote-user` | the mailbox address |
| `x-webobjects-auth-type` | `Basic` |
| `Authorization` | `Basic base64(<mailbox>:<mailbox password>)` |

Omitting `x-webobjects-auth-type` makes SOGo accept the request and serve read-only
endpoints, but leaves it without a usable credential: `Preferences/save` then fails with
`503` because SOGo cannot open the ManageSieve connection. Adding it fixes the write.

```bash
docker exec -it mailcow-nginx-mailcow-1 sh -c '
U="user@example.org"; P="<password>"; H="Authorization: Basic $(printf "%s:%s" "$U" "$P" | base64 | tr -d "\n")"
curl -s -H "x-webobjects-remote-user: $U" -H "x-webobjects-auth-type: Basic" -H "$H" \
  -H "Accept: application/json" \
  "http://sogo:20000/SOGo/so/$U/Preferences/jsonDefaults"'
```

→ `200`, full user-defaults JSON. No cookie jar, no XSRF token, no prior login, no SSO
master password needed.

---

## 2. Reading the vacation state

```http
GET http://sogo:20000/SOGo/so/<user>/Preferences/jsonDefaults
x-webobjects-remote-user: <user>
Authorization: Basic base64(<user>:<password>)
Accept: application/json
```

The vacation state is the `Vacation` key of the returned defaults object. Field names
come from `SOGoSieveManager` and the Preferences UI *[source]*:

| key | type | meaning |
|---|---|---|
| `enabled` | bool | master switch |
| `autoReplyText` | string | message body (plain text) |
| `customSubjectEnabled` | bool | use `customSubject` |
| `customSubject` | string | subject line |
| `startDate` / `endDate` | int | **Unix epoch seconds** |
| `startDateEnabled` / `endDateEnabled` | bool | use the dates |
| `startTime` / `endTime` | string | `"HH:MM"` |
| `startTimeEnabled` / `endTimeEnabled` | bool | use the times |
| `daysBetweenResponse` | int | days between auto-replies (default 7) |
| `autoReplyEmailAddresses` | string[] | addresses that receive replies |
| `ignoreLists` | bool | skip mailing lists / bulk |
| `alwaysSend` | bool | ignore reply tracking |
| `discardMails` | bool | discard instead of keep |
| `weekdaysEnabled` / `days` | bool / array | weekday restriction |

The Sieve time zone comes from the user's `SOGoTimeZone` default; the add-in should send
the browser's zone in the same save payload.

---

## 3. Writing

```http
POST http://sogo:20000/SOGo/so/<user>/Preferences/save
x-webobjects-remote-user: <user>
Authorization: Basic base64(<user>:<password>)
Content-Type: application/json

{"defaults":{"Vacation":{ …fields… }}}
```

- `saveAction` calls `[[userDefaults source] setValues:v]` — a **merge**. Sending only
  `Vacation` cannot wipe other preferences *[source]*.
- SOGo then regenerates and uploads the Sieve script itself
  (`updateFiltersAndForceActivation`). We never touch ManageSieve, so the SOGo UI and this
  add-in stay consistent *[source]*.
- Sieve unreachable → `500`/`503` with `{"message": …}`.
- XSRF: **not enforced** for proxy-authenticated requests *[verified live]* — the write
  succeeded without any `X-XSRF-TOKEN` header or cookie jar.
- Verified live: `POST …/Preferences/save` → `200`, values persisted and readable
  afterwards, ManageSieve connection established with the supplied mailbox password.
  (A save that fails only the Sieve step still persists the values, but answers `503` —
  so always treat non-200 as "not applied", not as "unknown".)

---

## 4. Architecture consequences

- Middleware is **stateless**: verify password via IMAP, perform one SOGo call, drop
  everything. No DB, no session store, no tokens.
- Middleware must run as a **container on `mailcow-network`** to reach `sogo:20000`;
  the public `/SOGo` route is unusable because nginx overwrites the auth header with its
  own session check.
- **IMAP verification is the security boundary.** Without it, `x-webobjects-remote-user`
  would let anyone write to any mailbox.
- Failure handling must be strict: Mailcow's netfilter bans the source IP on repeated
  auth failures, and SOGo itself blocks after 10 failed logins / 15 min. Never retry a
  failed IMAP login, rate-limit per source IP, and distinguish "wrong credentials"
  (non-retryable) from "SOGo/Sieve unavailable" (retryable).

---

## 5. Results

| item | result |
|---|---|
| Proxy-auth read (`jsonDefaults`) | ✅ `200`, full defaults JSON |
| Proxy-auth write (`Preferences/save`) | ✅ `200`, values persisted |
| Sieve upload via SOGo | ✅ connection established (no `503`) |
| `x-webobjects-auth-type: Basic` required | ✅ yes — omitting it breaks `save` with `503` |
| SSO master password required | ❌ no — the mailbox's own password works |
| XSRF token required | ❌ no |
| SOGo `/connect` password login | ❌ not usable on this instance (Mailcow SSO) |

Side effect of the test: the mailbox now holds `Vacation.enabled = false` with the probe
text. Harmless, no replies will be sent; the add-in will overwrite it on first real save.

Optional confirmation of the Sieve side:

```bash
docker exec -it mailcow-dovecot-mailcow-1 ls -l /var/vmail/sieve/user@example.org.sieve
```
