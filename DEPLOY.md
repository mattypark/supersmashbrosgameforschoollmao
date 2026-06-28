# Deploy SMASH ARENA online (free, permanent)

The game has a live server (it runs the match), so it deploys to a Node host —
not a static-only host. Render's free tier works great. One public URL serves
both the game and multiplayer.

## 1. Put the code on GitHub

Create an **empty** repo at <https://github.com/new> (name it `smash-arena`,
no README / .gitignore — this repo already has them).

Then, from this folder:

```bash
git add -A
git commit -m "SMASH ARENA: local + online platform fighter"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/smash-arena.git
git push -u origin main
```

## 2. Deploy on Render

1. Go to <https://render.com> and sign in with GitHub (free).
2. **New +  →  Blueprint**.
3. Pick your `smash-arena` repo. Render reads `render.yaml` automatically.
4. **Apply** / **Create**. First build takes ~2–3 minutes.
5. You get a public URL like `https://smash-arena.onrender.com`.

## 3. Play

- Open the Render URL anywhere.
- **PLAY ONLINE** → the server address is filled in automatically (`wss://…`).
- Everyone opens the **same URL**, connects, and one person hits **START MATCH**.

> Free tier note: the server sleeps after ~15 min idle. The first visit after
> that wakes it (~30s) — just wait and reload once.

## Other hosts

The repo also ships a `Procfile` (`web: node server/server.js`), so **Railway**
(<https://railway.app>) and **Fly.io** work the same way:

- Railway: New Project → Deploy from GitHub repo → it auto-detects Node.
- Fly: `fly launch` (uses the Procfile), then `fly deploy`.

All of them set `process.env.PORT`, which the server already honors.

## Frontend on Vercel (hybrid)

Vercel is serverless — it **cannot** run the always-on WebSocket game server. So
on Vercel you host only the **static client**; the multiplayer server stays on
Render. The client is already wired to connect to the Render server from any
static host (`ONLINE_SERVER` in `src/main.js`).

1. Push the latest code to GitHub (includes `vercel.json` + `.vercelignore`).
2. Go to <https://vercel.com> → sign in with GitHub.
3. **Add New… → Project** → import `supersmashbrosgameforschoollmao`.
4. Framework Preset: **Other**. Build Command: leave empty. Output Directory: `.`
   (root). These come from `vercel.json` automatically — just click **Deploy**.
5. You get a URL like `https://supersmashbrosgameforschoollmao.vercel.app`.

The page loads instantly from Vercel's CDN; **PLAY ONLINE** connects to the
Render server (`wss://smash-arena.onrender.com`). If you ever rename the Render
service, update `ONLINE_SERVER` in `src/main.js`.

> Note: the *first* online match still wakes the Render free-tier server (~30s).
> Vercel only speeds up the page load, not the server cold-start.

## Local (no deploy)

```bash
npm start            # serves game + multiplayer on http://localhost:8080
```

Same network play: share `http://<your-LAN-ip>:8080`.
