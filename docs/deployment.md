# Деплой: боевой стенд Lidogram

**Адрес:** https://lidogram.72-56-101-176.sslip.io · **бот:** [@testbotcrmebot](https://t.me/testbotcrmebot)
**Сервер:** общий VPS (Ubuntu 24.04, x86_64), ниже — `<server>` · **выкачен:** 2026-10-02

> **Сервер общий.** Кроме Lidogram на нём работают около двадцати чужих сайтов и сервисов, у которых
> общие Docker, nginx, cron и диск. Прочитайте [правила](#правила-работы-на-этом-сервере), прежде чем
> что-либо запускать. Сломать что-то чужое — единственный недопустимый исход любой работы здесь.

---

## Что где лежит

| Часть | Где | Как достучаться |
|---|---|---|
| Код и конфигурация | `/opt/lidogram` (`700 root:root`) | — |
| Секреты | `/opt/lidogram/.env` (`600 root:root`) | только на сервере |
| Compose-проект | `lidogram`, файл `compose.prod.yml` | — |
| `web` — CRM (Next.js) | порт контейнера 3000 | `127.0.0.1:3700` |
| `bot` — бот (long polling) и очередь задач | — | наружу не открыт |
| `postgres` 17-alpine | том `lidogram_pg-data` | **наружу не открыт** |
| `migrate` | одноразовый: миграции и сид | — |
| vhost nginx | `/etc/nginx/sites-available/lidogram` (+ symlink) | порты 80/443 |
| TLS-сертификат | `/etc/letsencrypt/live/lidogram.72-56-101-176.sslip.io/` | обновляется сам, с `reload nginx` |
| Бэкапы | `/srv/backups/lidogram/` | `/etc/cron.d/lidogram`, 00:50 UTC, 14 штук |
| Снимки сервера | `/root/lidogram-deploy/` | до и после каждого деплоя |

Лимиты: `web` — 1 GB и 1 CPU, `bot` и `migrate` — 512 MB и 1 CPU, `postgres` — 512 MB и 0.5 CPU.
Node-сервисы работают без Linux capabilities (`cap_drop: ALL`, `no-new-privileges`).

Файлы в репозитории:

| Файл | Зачем |
|---|---|
| `compose.prod.yml` | Стек: ни один сервис не занимает 80/443 и публичные порты |
| `deploy/pack.sh` | Собирает `lidogram-release.tgz` строго по списку файлов |
| `deploy/snapshot.sh` | Снимок сервера только на чтение — для сравнения «до» и «после» |
| `deploy/backup.sh` | Ночной `pg_dump` внутри контейнера, итог в syslog (`lidogram-backup`) |
| `deploy/cron.d/lidogram` | Расписание бэкапа (отдельный файл, общий crontab не трогается) |
| `deploy/nginx/lidogram.conf` | Итоговый vhost; `lidogram-bootstrap.conf` — только для первого выпуска сертификата |

---

## Повседневные команды

Всегда из `/opt/lidogram` и всегда с **обоими** флагами `-p lidogram -f compose.prod.yml`: без `-p`
Compose берёт имя проекта из имени папки, и команда в чужой папке остановит чужой проект.

```bash
cd /opt/lidogram
docker compose -p lidogram -f compose.prod.yml ps
docker compose -p lidogram -f compose.prod.yml logs -f bot          # или web, migrate
docker compose -p lidogram -f compose.prod.yml restart bot
docker compose -p lidogram -f compose.prod.yml exec postgres psql -U lidogram -d lidogram
```

Здоровье:

```bash
curl https://lidogram.72-56-101-176.sslip.io/api/healthz   # {"status":"ok"} — nginx, порт, приложение и база
curl http://127.0.0.1:3700/api/healthz                     # то же в обход nginx (с сервера)
```

`502` снаружи — nginx жив, а контейнер `web` нет: смотрите `ps` и `logs web`. Ошибки в логах:
`docker compose -p lidogram -f compose.prod.yml logs --since 1h web bot | grep -E '"level":(50|60)'`.

Проверка OpenAI изнутри контейнера:

```bash
docker compose -p lidogram -f compose.prod.yml run --rm --no-deps -T bot npx tsx scripts/ai-smoke.ts
```

---

## Повторный деплой

С машины разработчика:

```bash
deploy/pack.sh                                                     # → lidogram-release.tgz
ssh <server> 'bash -s > /root/lidogram-deploy/before.txt' < deploy/snapshot.sh
ssh <server> 'mkdir -m 700 /opt/lidogram-staging'
ssh <server> 'tar -xzf - -C /opt/lidogram-staging --no-same-owner' < lidogram-release.tgz
```

На сервере, по одной команде:

```bash
rsync -a --delete --exclude=/.env /opt/lidogram-staging/ /opt/lidogram/   # удалённые из репо файлы уходят
rm -rf /opt/lidogram-staging
chmod -R go-rwx /opt/lidogram
cd /opt/lidogram
docker tag lidogram:latest lidogram:previous                               # для отката
free -m; df -h /                                                           # сборке нужно ≥ 3 GiB RAM и ≥ 15 GB диска
docker compose -p lidogram -f compose.prod.yml build web                   # единственная сборка
docker compose -p lidogram -f compose.prod.yml up -d                       # migrate → web, bot
curl -s http://127.0.0.1:3700/api/healthz
```

Распаковывать архив прямо в `/opt/lidogram` нельзя: `tar` не удаляет файлы, которых больше нет в
репозитории, и в образ попадут старые маршруты. Поэтому — через пустую `staging` и `rsync --delete`.

`docker compose --dry-run … up` здесь не использовать: в Compose v5.0.1 он бесконечно ждёт
healthcheck базы. Вместо него — `config --images` (все образы уже есть локально) и `config`.

После деплоя — снимок «после» и сравнение (см. [ниже](#проверка-что-деплой-ничего-не-задел)).

### Откат неудачного деплоя

```bash
docker tag lidogram:previous lidogram:latest
docker compose -p lidogram -f compose.prod.yml up -d --force-recreate web bot
```

Ненужный старый образ удаляйте **по ID** (`docker image rm <id>`), не через `prune`.

### Убрать стенд целиком

Каждый шаг независим и безопасен сам по себе:

```bash
rm /etc/nginx/sites-enabled/lidogram     # 1. снять с публикации; затем nginx -t и systemctl reload nginx
cd /opt/lidogram && docker compose -p lidogram -f compose.prod.yml down   # 2. остановить, данные сохранятся
rm /etc/cron.d/lidogram                  # 3. убрать бэкап
docker compose -p lidogram -f compose.prod.yml down -v    # 4. только если данные точно не нужны
```

Сертификат можно оставить: он ничего не стоит и обновляется без вреда.

---

## Правила работы на этом сервере

**Никогда:**

1. `docker system|image|volume|network|container prune` в любом виде. На сервере есть остановленные,
   но нужные чужие контейнеры и образы без реестра — восстановить их будет не из чего.
   `docker builder prune` (чистит кэш сборки всех проектов) — только по явному согласию владельца.
2. `docker compose pull`, `docker pull`, `--pull`. Образ `postgres:17-alpine` общий с другим проектом:
   сдвинутый тег незаметно поменяет его базу при следующем пересоздании.
3. Команды Docker к объектам не с префиксом `lidogram`; `docker compose` без `-p lidogram -f compose.prod.yml`.
4. Создавать `/etc/docker/daemon.json`, перезапускать `docker` / `containerd` — это перезапустит все
   контейнеры сервера.
5. `systemctl restart nginx`. Только `nginx -t`, прочитать вывод, потом `systemctl reload nginx`.
   `nginx -t` до нас уже печатает **3 предупреждения** `protocol options redefined` от чужих vhost'ов;
   четвёртое — ваше, найдите и уберите. `certbot --nginx` тоже нельзя: он правит конфиги сам.
6. Менять в нашем vhost строки `listen`: только `listen 80;` и `listen 443 ssl;`. Никаких `[::]`,
   IP-адресов, `default_server`, `http2`, `reuseport` — это общие сокеты всех сайтов сервера.
7. Править общий crontab (`crontab -e`, `crontab -`). Наш cron — только `/etc/cron.d/lidogram`.
8. Публиковать порты на `0.0.0.0`, занимать 80, 443, 5432. Порты контейнеров — только на
   `127.0.0.1`, наружу всё идёт через nginx хоста.
9. Копировать сюда `compose.yml`, `compose.edge.yml`, `Caddyfile` — `pack.sh` их не пропускает.
10. Чинить, перезапускать или откатывать что-то не наше, даже если оно выглядит сломанным. Сообщить
    владельцу.

**Всегда:** перед сборкой — `free -m` и `df -h /` (свободного диска не меньше 10 GB после сборки);
каждая изменяющая команда — отдельно, чтобы ошибка была видна.

---

## Проверка, что деплой ничего не задел

`deploy/snapshot.sh` снимает с сервера только устойчивые поля: контейнеры и их здоровье, точный набор
образов, тома, сети, сокеты, `nginx -t`, vhost'ы, сертификаты, хэш общего crontab, сервисы systemd,
pm2 и код ответа **каждого** домена этого nginx (запросы идут прямо в nginx через `--resolve`,
без DNS). Снимок остаётся на сервере и в репозиторий не попадает: в нём чужие проекты.

```bash
ssh <server> 'bash -s > /root/lidogram-deploy/after.txt' < deploy/snapshot.sh
# на сервере:
cd /root/lidogram-deploy
diff <(sed '/^===== VOLATILE/,$d' before.txt) <(sed '/^===== VOLATILE/,$d' after.txt)
```

Допустимы только строки про наши объекты (`lidogram*`). Любая другая строка — остановиться и
разобраться; домен с другим кодом ответа перепроверить ещё дважды.

---

## Сертификат

```
/etc/letsencrypt/renewal/lidogram.72-56-101-176.sslip.io.conf
  authenticator = webroot
  webroot_path  = /var/www/certbot
  renew_hook    = systemctl reload nginx
```

Хук обязателен: без него обновлённый сертификат лёг бы на диск, а nginx продолжал бы отдавать
старый, пока тот не истечёт. Проверка без выпуска:
`certbot renew --dry-run --cert-name lidogram.72-56-101-176.sslip.io`.

---

## Конфигурация

`/opt/lidogram/.env`, `600 root:root`, **не коммитится и не копируется с сервера**.

| Переменная | Значение / откуда |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY` | секреты владельца; передаются на сервер через stdin ssh |
| `AUTH_SECRET`, `POSTGRES_PASSWORD`, `SEED_MANAGER_PASSWORD` | сгенерированы на сервере (`openssl rand -hex`) |
| `APP_URL` | `https://lidogram.72-56-101-176.sslip.io` |
| `TELEGRAM_BOT_USERNAME` | `testbotcrmebot` |
| `AI_ENABLED`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_SMART` | `true`, `gpt-5.4-nano`, `gpt-5.4-mini` |
| `SEED_MANAGER_EMAIL`, `SHOW_DEMO_CREDENTIALS` | `manager@demo.local`, `true` (вход для проверяющих) |
| `POSTGRES_USER`, `POSTGRES_DB` | `lidogram` |
| `APP_HTTP_PORT`, `TZ`, `LOG_LEVEL` | `3700`, `Europe/Moscow`, `info` |

`LOG_LEVEL=debug` — только временно для расследования, потом вернуть `info`.

Один токен — один потребитель обновлений: никогда не запускайте локальный `npm run bot:dev` с
боевым токеном, для разработки нужен отдельный dev-бот.

### Бэкапы

```bash
cd /opt/lidogram
/opt/lidogram/deploy/backup.sh                          # снять сейчас
journalctl -t lidogram-backup --since today             # итог ночных запусков
zcat /srv/backups/lidogram/lidogram-YYYY-MM-DD.sql.gz | \
  docker compose -p lidogram -f compose.prod.yml exec -T postgres psql -U lidogram -d lidogram   # восстановить в пустую базу
```

`pg_dump` выполняется внутри контейнера: база — PostgreSQL 17, клиент на хосте старше не умеет.

---

## После перезагрузки сервера

Docker поднимает контейнеры сам, но без порядка из Compose. Бот поэтому сначала ждёт базу
(`waitForDatabase`, до 60 с, каждая попытка — `warn` в логе) и только потом забирает сообщения,
накопленные в Telegram за простой. Если база не ответила за 60 с, бот завершается, Docker
перезапускает его, и ожидание повторяется. Проверено учением 2026-10-02: база остановлена → бот
ждёт → база запущена → «database ready» → «bot started».
