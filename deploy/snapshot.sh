#!/usr/bin/env bash
# Read-only snapshot of the shared host, for a before/after diff around a deployment.
# It changes nothing: no writes, no restarts; the only network calls are HTTP probes sent to this
# host's own nginx. Stable fields only; the VOLATILE section at the end is left out of the diff.
#   ssh root@<host> 'bash -s > /root/lidogram-deploy/baseline-before.txt' < deploy/snapshot.sh
#   diff <(sed '/^===== VOLATILE/,$d' before.txt) <(sed '/^===== VOLATILE/,$d' after.txt)
set -uo pipefail # not -e: one failing probe must not cut the snapshot short

section() { printf '\n===== %s\n' "$1"; }

section "containers: name | image | status | health | exit code"
docker ps -aq | xargs -r docker inspect -f \
  '{{.Name}} | {{.Config.Image}} | {{.State.Status}} | {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} | {{.State.ExitCode}}' \
  | sed 's#^/##' | sort

section "published ports"
docker ps -a --format '{{.Names}}: {{.Ports}}' | sort

section "image ids (exactly the set a prune would destroy)"
docker images -q --no-trunc | sort -u

section "images (repository:tag id)"
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | sort

section "volumes"
docker volume ls -q | sort

section "networks and subnets"
docker network ls -q | xargs -r docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' | sort

section "compose projects"
docker compose ls -a | sort

section "pm2 apps (name status)"
if command -v pm2 > /dev/null; then
  pm2 jlist 2> /dev/null | python3 -c 'import json, sys; [print(p["name"], p["pm2_env"]["status"]) for p in json.load(sys.stdin)]' | sort
else
  echo "pm2 not installed"
fi

section "systemd: failed units"
systemctl --failed --no-legend --plain | awk '{print $1}' | sort

section "systemd: key units"
for unit in nginx docker containerd cron certbot.timer postgresql; do
  echo "$unit $(systemctl is-active "$unit" 2> /dev/null)"
done

section "routes"
ip route | sort

section "listening tcp"
ss -ltnH | awk '{print $4}' | sort -u

section "listening udp"
ss -lunH | awk '{print $4}' | sort -u

section "nginx -t (timestamps and pids stripped)"
nginx -t 2>&1 | sed -E 's#^[0-9]{4}/[0-9]{2}/[0-9]{2} [0-9:]{8} \[([a-z]+)\] [0-9]+\#[0-9]+: #[\1] #'

section "nginx sites-enabled"
ls -1 /etc/nginx/sites-enabled/

section "nginx server_name inventory (file: names)"
# -R, not -r: sites-enabled holds symlinks, and -r would silently find nothing.
grep -RHoE 'server_name[^;]+' /etc/nginx/sites-enabled/ \
  | sed -E 's#^/etc/nginx/sites-enabled/##; s/server_name[[:space:]]+//' | sort -u

section "certificates"
ls -1 /etc/letsencrypt/live/ | grep -v '^README$'

section "cron"
echo "root crontab sha256: $(crontab -l 2> /dev/null | sha256sum | cut -d' ' -f1)"
ls -1 /etc/cron.d/

section "probes through this nginx: name https-code http-code"
# --resolve sends every probe to this host's nginx, so DNS or a CDN can never cause a difference.
names="$(grep -RhoE 'server_name[^;]+' /etc/nginx/sites-enabled/ | sed -E 's/server_name//' \
  | tr -s ' \t' '\n' | grep -vE '^$|^_$|\*|^~|^[0-9.]+$|^localhost$' | sort -u)"
for name in $names; do
  resolve=(--resolve "$name:443:127.0.0.1" --resolve "$name:80:127.0.0.1")
  https="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${resolve[@]}" "https://$name/" 2> /dev/null)"
  http="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${resolve[@]}" "http://$name/" 2> /dev/null)"
  echo "$name https=${https:-000} http=${http:-000}"
done

section "VOLATILE (left out of the diff)"
hostname
date -u '+%Y-%m-%d %H:%M:%S UTC'
uptime
free -m
df -h /
