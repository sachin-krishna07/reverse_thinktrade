# VPS Backend Update Process

## Normal Update (code change kiya, GitHub pe push kiya)

```bash
cd ~/think-trade-new
git pull origin main
systemctl restart thinktrade
```

---

## Agar main.py conflict aaye

```bash
cd ~/think-trade-new
git stash
git pull origin main
systemctl restart thinktrade
```

---

## Backend status check karna ho

```bash
systemctl status thinktrade
```

## Logs dekhne ho

```bash
journalctl -u thinktrade -n 100 --no-pager
```

## Backend manually stop/start

```bash
systemctl stop thinktrade
systemctl start thinktrade
```

---

## VPS Details

- IP: 187.127.176.55
- OS: Ubuntu 24.04 LTS
- Project path: /root/think-trade-new
- Backend port: 8000
- Service name: thinktrade
- Python venv: /root/think-trade-new/backend/venv

## .env file edit karna ho

```bash
nano ~/think-trade-new/backend/.env
```

Save: Ctrl+X → Y → Enter, phir restart karo.
