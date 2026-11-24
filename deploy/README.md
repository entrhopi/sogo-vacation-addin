# Deploying sogo-ooo

Three pieces: the container (API + static add-in), the Mailcow nginx route, and
the Outlook add-in installation.

## 1. Container

```bash
cd /opt/stacks/mailcow-sogo-ooo
cp deploy/.env.example .env    # first time only, then edit
```

`.env` needs at least:

| variable | value |
|---|---|
| `OOO_IMAGE` | `ghcr.io/entrhopi/sogo-vacation-addin:edge` |
| `MAILCOW_NETWORK` | from `docker network ls \| grep -i mailcow` |
| `ADDIN_ORIGINS` | `https://<mail-host>` |
| `IMAP_TLS_SERVERNAME` | the name on Dovecot's certificate (often the mail host) |
| `PUBLIC_BASE_URL` | `https://<mail-host>/ooo` |

```bash
docker compose pull && docker compose up -d
docker inspect --format '{{.State.Health.Status}}' sogo-ooo   # healthy
```

## 2. Nginx route (Mailcow)

The add-in must share the origin of the Mailcow vhost: `https://<host>/ooo/`.

```bash
cp deploy/nginx/ooo.conf.inc <mailcow>/data/conf/nginx/ooo.conf.inc
```

Then edit `<mailcow>/data/conf/nginx/templates/sites-default.conf.j2` and add,
right after `client_max_body_size 64m;`:

```nginx
include /etc/nginx/conf.d/ooo.conf.inc;
```

Restart nginx so the template is re-rendered:

```bash
docker restart mailcow-nginx-mailcow-1
docker exec mailcow-nginx-mailcow-1 grep -n 'ooo.conf.inc' /etc/nginx/includes/sites-default.conf
```

If that `grep` prints nothing, the image did not re-render the template and the
route will not exist — stop and check the nginx container's startup logs before
continuing.

Verify from outside:

```bash
curl -sI https://<host>/ooo/ | head -3            # 200, text/html
curl -s  https://<host>/ooo/manifest.xml | head -5  # <OfficeApp ... your host ...>
curl -s  -o /dev/null -w '%{http_code}\n' https://<host>/ooo/api/vacation  # 401
```

The 401 is correct: no credentials were sent.

## 3. Install the add-in

The manifest is generated from the running container, so always install the
*served* one, never the repository copy (that one points at localhost):

```bash
curl -s https://<host>/ooo/manifest.xml -o sogo-ooo-manifest.xml
```

In Outlook on the web: **Settings → Mail → Custom add-ins → Add a custom add-in
→ Add from file**, then pick `sogo-ooo-manifest.xml`. Classic Outlook on Windows
picks it up from the mailbox after OWA has accepted it.

The button appears on the ribbon when a message is selected — never while
composing, since no compose command surface is declared.

## 4. Updating

```bash
docker compose pull && docker compose up -d
```

No manifest change is needed when the host stays the same: the manifest is
rendered per request from `PUBLIC_BASE_URL`. Office caches manifests, so after
changing `PUBLIC_BASE_URL` remove and re-add the add-in.

## Notes

- Mailcow updates may overwrite `data/conf/nginx/templates/*`. Re-apply the
  one-line `include` if `git` reports a conflict there.
- `sogo-ooo` has no published port; it is reachable only through the shared
  Docker network, which is also why the nginx location resolves it by name.
