# Vacation API (middleware)

Base: `https://<mailcow-host>/ooo` in production (nginx → container, no published
port). Inside the docker network: `http://sogo-ooo:8080`.

Authentication is HTTP Basic with the **mailbox address** as username and the
**mailbox password**. There is no session and no token: every request carries the
credential, the middleware proves it against Dovecot, then acts on SOGo and forgets
it. No `WWW-Authenticate` header is sent, so no browser auth dialog appears.

```
Authorization: Basic base64("ooo@example.org:p4ssw0rd")
```

## GET /api/vacation

Reads the current state.

```json
{
  "vacation": {
    "enabled": false,
    "autoReplyText": "probe",
    "customSubjectEnabled": true,
    "customSubject": "probe",
    "startDateEnabled": false,
    "startDate": null,
    "endDateEnabled": false,
    "endDate": null,
    "startTimeEnabled": false,
    "startTime": null,
    "endTimeEnabled": false,
    "endTime": null,
    "daysBetweenResponse": 7,
    "autoReplyEmailAddresses": ["user@example.org"],
    "ignoreLists": false,
    "alwaysSend": false,
    "discardMails": false
  },
  "configured": true
}
```

`configured` is `false` when SOGo has never stored a `Vacation` object; the view is
then returned with defaults.

## PUT /api/vacation

Partial update. Any subset of the same fields is accepted; unknown fields are
rejected with `400` details.

```json
{
  "enabled": true,
  "autoReplyText": "I am away until Monday.",
  "customSubjectEnabled": true,
  "customSubject": "Out of office",
  "startDateEnabled": true,
  "startDate": 1764543600,
  "endDateEnabled": true,
  "endDate": 1765148400,
  "startTimeEnabled": false,
  "endTimeEnabled": false,
  "daysBetweenResponse": 7,
  "ignoreLists": true
}
```

- `startDate`/`endDate` are **Unix epoch seconds** (SOGo converts them to dates).
- `startTime`/`endTime` are `"HH:MM"`.
- `null` for a date/time removes the stored value.
- `startDate` must not be after `endDate`, otherwise `400`.
- Response: the same shape as `GET`.
- SOGo regenerates and uploads its Sieve script during this call. A `200` means the
  script was accepted; a `503` means it was not (values may already be stored, so
  treat non-2xx as "not applied").

## Errors

Every failure uses one envelope, including a request id for log correlation:

```json
{ "error": { "code": "BAD_CREDENTIALS", "message": "…", "retryable": false, "requestId": "…" } }
```

| code | HTTP | retryable | meaning |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | no | bad credentials format or invalid field (`details` lists them) |
| `BAD_CREDENTIALS` | 401 | no | Dovecot rejected the password |
| `MAILBOX_NOT_FOUND` | 404 | no | SOGo does not know this mailbox (alias, disabled domain) |
| `RATE_LIMITED` | 429 | yes | per-IP limit or repeated bad passwords; `details.retryAfterSeconds` |
| `IMAP_UNAVAILABLE` | 503 | yes | mail server unreachable or timed out |
| `SOGO_UNAVAILABLE` | 503 | yes | SOGo unreachable, timed out, or Sieve upload failed |
| `INTERNAL` | 500 | yes | unexpected |

Client rule: retry only when `retryable` is `true`, and never resend a password after
`BAD_CREDENTIALS`.

## Limits

- 30 requests/minute per source IP.
- 5 consecutive failed logins trip a 60 s cooldown for the whole service. This is
  deliberate: Mailcow's netfilter bans the failing source IP, which here is the
  middleware container, so an unthrottled attempt could take everyone offline.

## Trying it

```bash
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' sogo-ooo)
curl -s -u 'user@example.org:PASSWORD' "http://$IP:8080/api/vacation"
```
