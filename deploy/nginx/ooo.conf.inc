# Serves the add-in and its API under /ooo/ on the existing Mailcow vhost.
#
# Install:
#   1. copy this file to <mailcow>/data/conf/nginx/ooo.conf.inc
#      (mounted at /etc/nginx/conf.d/ooo.conf.inc in the nginx container)
#   2. inside <mailcow>/data/conf/nginx/templates/sites-default.conf.j2, add
#      this line after `client_max_body_size 64m;`:
#         include /etc/nginx/conf.d/ooo.conf.inc;
#   3. docker restart mailcow-nginx-mailcow-1
#
# The file is deliberately named *.inc: everything matching *.conf in that
# directory is included by nginx in the http context, where a bare `location`
# would be a syntax error.

location = /ooo {
    return 301 /ooo/;
}

location /ooo/ {
    # Resolve the container on every request instead of at config load: nginx
    # otherwise refuses to start (or keeps a stale IP) when sogo-ooo is down.
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $ooo_upstream sogo-ooo:8080;

    # /ooo/<x> -> /<x>; the add-in calls api/vacation relatively, so one
    # location serves both the static files and the API.
    rewrite ^/ooo/(.*)$ /$1 break;

    proxy_pass http://$ooo_upstream;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # Overwrite rather than append: the middleware trusts this header for its
    # per-IP rate limiting, and clients must not be able to spoof it.
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    client_max_body_size 1m;

    # Any add_header here drops the server-level set, which includes
    # `X-Frame-Options: SAMEORIGIN`. That header would stop Outlook from
    # framing the taskpane, so it is intentionally not re-added. Replace it
    # with a CSP that only allows the Office hosts to frame the pane.
    add_header Strict-Transport-Security "max-age=15768000;" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin always;
    add_header Content-Security-Policy "frame-ancestors 'self' https://*.office.com https://*.office365.com https://*.officeapps.live.com https://*.microsoft365.com https://*.outlook.com https://*.outlook.office.com" always;
}
