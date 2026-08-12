# Reverse ThinkTrade — Push & Deploy Process

Ye repo do jagah jaati hai:

| Remote | URL |
|---|---|
| `origin` / `new-origin` | github.com/sachin-krishna07/think-trade-new |
| `reverse_thinktrade` | github.com/sachin-krishna07/reverse_thinktrade |

Neeche sirf **reverse** wale ka process hai.

---

## 1. Local (Windows) — push karna

Project path: `D:\Projects\ThinkTrade\ThinkTrade 3.0`

### Push se pehle — secrets check (skip mat karna)

`.env` me Binance + Supabase keys hain. Teen check:

```bash
git ls-files | grep "\.env"
```
Output **khaali** aana chahiye = koi .env tracked nahi.

```bash
git check-ignore -v backend/.env frontend/.env
```
Dono lines aani chahiye = properly ignored.

```bash
git log --all --pretty=format: --name-only --diff-filter=A | grep "\.env"
```
Output **khaali** = purani history bhi clean.

### Push

```bash
git add -A
git diff --cached --name-status
git commit -m "your message"
git push reverse_thinktrade main
```

> **Force push (`-f`) ki zarurat aam taur par nahi hoti.** Pehle
> `git fetch reverse_thinktrade` karke `git log reverse_thinktrade/main --oneline -3`
> dekho. Agar remote ka top commit tumhare local base jaisa hai to normal push
> fast-forward ho jayega aur remote history safe rahegi. `-f` sirf tab jab
> repo sach me diverge ho gaya ho.

---

## 2. VPS — deploy karna

Server: `srv1721921` · Path: `~/reverse_thinktrade` · Service: `reverse-backend`

```bash
cd ~/reverse_thinktrade
git pull
sudo systemctl restart reverse-backend
```

### Restart ke baad verify (ye zaroori hai)

`systemctl restart` chup rehna = systemd ne command maani. App crash hui ya
nahi, ye alag baat hai. Isliye:

```bash
sudo systemctl status reverse-backend --no-pager
sudo journalctl -u reverse-backend -n 60 --no-pager
```

Startup me ye lines dikhni chahiye:
- `Price/qty precision merged for N symbols`
- `Wallet loaded: $...`
- `Bot started`

---

## 3. Frontend bhi badla ho to

```bash
cd ~/reverse_thinktrade/frontend
npm install
npm run build
```

`npm install` skip mat karna agar `package.json` diff me aaya ho — naya
dependency hoga to seedha `npm run build` fail ho jayega.

---

## 4. ⚠️ SQL migration — backend restart se PEHLE

Agar commit me koi `supabase_*.sql` ya `supabase/migrations/*` aaya hai to
usko Supabase SQL Editor me **pehle** chalao, tabhi backend restart karo.

Warna backend uthh to jayega aur signals bhi banenge, par har trade insert
fail hogi:

```
Failed to insert trade into Supabase — check table exists & RLS disabled
```

Column add karne ke baad backend restart dobara karne ki zarurat nahi —
Supabase REST se query hoti hai, schema turant reflect ho jaata hai.

---

## Rollback

```bash
cd ~/reverse_thinktrade
git log --oneline -5
git reset --hard <purana-commit-hash>
sudo systemctl restart reverse-backend
```

`git reset --hard` local changes mita deta hai — pehle `git status` dekh lo.
