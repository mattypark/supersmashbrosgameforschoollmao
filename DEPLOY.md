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

## Local (no deploy)

```bash
npm start            # serves game + multiplayer on http://localhost:8080
```

Same network play: share `http://<your-LAN-ip>:8080`.
