# Minecraft AFK Bot + Dashboard

## Project structure

```
minecraft-bot/
├── server.js       ← Bot + WebSocket server (run on PC/Railway/Render)
├── index.html      ← Dashboard (host on Vercel)
├── package.json
└── vercel.json
```

---

## Step 1 — Edit server.js config

Open `server.js` and change the top CONFIG block:

```js
const CONFIG = {
  host: 'your.server.ip',    // ← MC server IP
  port: 25565,
  username: 'AFK_Bot',       // ← bot's username
  version: '1.20.1',         // ← must match MC server version
  auth: 'offline',           // ← 'microsoft' for premium account
  owner: 'YourUsername',     // ← your MC username for owner commands
  wsPort: 3001,
  reconnectDelay: 5000,
};
```

---

## Step 2 — Run the bot

```bash
npm install
npm start
```

Bot will connect and start the WebSocket server on port 3001.

---

## Step 3 — Deploy dashboard to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or just drag-and-drop `index.html` + `vercel.json` into vercel.com → New Project → Deploy.

---

## Step 4 — Connect dashboard to bot

1. Open your Vercel dashboard URL
2. In the "Bot server:" field, enter: `ws://YOUR_PC_IP:3001`
3. Click Connect

> If running on Railway/Render, use their public WebSocket URL instead.

---

## Free hosting options for the BOT (server.js)

| Platform | Free tier | Notes |
|----------|-----------|-------|
| Railway  | 500hrs/mo free | Easiest, supports Node.js |
| Render   | Free tier | May sleep after inactivity |
| Replit   | Free      | Use "Always On" for 24/7 |
| Oracle Cloud | Always free | 4 CPU + 24GB RAM, best specs |
| Your PC  | Free      | Needs to stay on 24/7 |

### Deploy to Railway (recommended)
1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variables if needed
4. Railway gives you a public URL like `wss://your-app.railway.app`

---

## Owner commands (type in MC chat)

| Command | Action |
|---------|--------|
| `!come` | Bot walks to you |
| `!follow <name>` | Bot follows a player |
| `!unfollow` | Stop following |
| `!stop` | Stop all movement |
| `!burst` | Trigger anti-AFK burst |
| `!pos` | Print current position |
| `!health` | Print HP and food |
| `!armor` | Auto-equip best armor |
| `!say <text>` | Bot says something |

---

## Dashboard features

- Live position on top-down radar with movement trail
- Health, food, TPS, ping bars
- Real-time event log with color-coded types
- Action feed showing what bot is doing
- Controls: stop, burst, reconnect, equip armor
- Send chat as bot from dashboard
- Adjustable radar range
- Auto-reconnects if bot server restarts
