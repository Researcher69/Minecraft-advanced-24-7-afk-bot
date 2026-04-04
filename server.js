const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear } = goals;
const { WebSocketServer } = require('ws');
const http = require('http');

// ─── CONFIG ────────────────────────────────────────────
const CONFIG = {
  host: 'your.server.ip',
  port: 25565,
  username: 'AFK_Bot',
  version: '1.20.1',
  auth: 'offline',       // 'microsoft' for premium accounts
  owner: 'YourUsername', // your MC username for owner commands
  wsPort: 3001,
  reconnectDelay: 5000,
};

const HUMAN_REPLIES = [
  'brb', 'afk rn', 'one sec', 'busy atm', 'k', 'lol', 'hmm', 'yeah', 'sure', 'ok'
];

// ─── STATE ─────────────────────────────────────────────
let bot = null;
let isFollowing = false;
let followTarget = null;
let botStats = {
  health: 20, food: 20, ping: 0,
  pos: { x: 0, y: 64, z: 0 },
  pitch: 0, yaw: 0,
  status: 'offline',
  uptime: 0,
  reconnects: 0,
  dimension: 'overworld',
  currentAction: 'Idle',
};
let startTime = Date.now();
let intervals = [];

// ─── WEBSOCKET SERVER ──────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'Bot server running', stats: botStats }));
});

const wss = new WebSocketServer({ server });
server.listen(CONFIG.wsPort, () => {
  console.log(`[WS] Dashboard server on port ${CONFIG.wsPort}`);
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

function log(msg, type = 'info') {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] [${type.toUpperCase()}] ${msg}`);
  broadcast({ log: msg, logType: type });
}

function action(label, icon, color) {
  botStats.currentAction = label;
  broadcast({ action: label, icon, color });
}

// ─── BOT CREATION ──────────────────────────────────────
function createBot() {
  clearAllIntervals();

  log(`Connecting to ${CONFIG.host}:${CONFIG.port}...`, 'warn');
  botStats.status = 'connecting';
  broadcast({ statusUpdate: botStats });

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth,
  });

  bot.loadPlugin(pathfinder);

  // ─── SPAWN ───────────────────────────────────────────
  bot.on('spawn', () => {
    log('Bot spawned successfully!', 'info');
    botStats.status = 'online';
    botStats.reconnects++;
    startTime = Date.now();
    broadcast({ statusUpdate: botStats });

    setupMovements();
    startAntiAFK();
    startSurvival();
    startStatsBroadcast();
    autoEquipArmor();
  });

  // ─── CHAT ─────────────────────────────────────────────
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const msg = message.toLowerCase();
    log(`<${username}> ${message}`, 'chat');

    // Owner commands
    if (username === CONFIG.owner) {
      handleOwnerCommand(username, msg, message);
    }

    // Reply if mentioned
    if (msg.includes(bot.username.toLowerCase())) {
      const delay = Math.random() * 3000 + 1000;
      setTimeout(() => {
        const reply = HUMAN_REPLIES[Math.floor(Math.random() * HUMAN_REPLIES.length)];
        bot.chat(reply);
        log(`Bot replied: ${reply}`, 'info');
      }, delay);
    }

    // AFK kick detection
    if (['afk', 'idle', 'inactive', 'kick'].some(w => msg.includes(w))) {
      log('AFK warning detected in chat! Triggering burst...', 'warn');
      triggerBurst();
    }
  });

  // ─── MESSAGES (whisper) ───────────────────────────────
  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString();
    if (text.toLowerCase().includes('afk') || text.toLowerCase().includes('kicked')) {
      triggerBurst();
    }
  });

  // ─── HEALTH ───────────────────────────────────────────
  bot.on('health', () => {
    botStats.health = bot.health;
    botStats.food = bot.food;
  });

  // ─── DEATH ────────────────────────────────────────────
  bot.on('death', () => {
    log('Bot died — respawning...', 'err');
    action('Died — respawning', '💀', '#2d1515');
    setTimeout(() => bot.respawn(), 1000);
  });

  // ─── KICKED ───────────────────────────────────────────
  bot.on('kicked', (reason) => {
    log(`Kicked: ${reason}`, 'err');
    botStats.status = 'offline';
    broadcast({ statusUpdate: botStats });
    clearAllIntervals();
    setTimeout(createBot, CONFIG.reconnectDelay);
  });

  // ─── ERROR ────────────────────────────────────────────
  bot.on('error', (err) => {
    log(`Error: ${err.message}`, 'err');
    botStats.status = 'error';
    broadcast({ statusUpdate: botStats });
  });

  // ─── END ──────────────────────────────────────────────
  bot.on('end', () => {
    log('Disconnected — reconnecting in 5s...', 'warn');
    botStats.status = 'offline';
    broadcast({ statusUpdate: botStats });
    clearAllIntervals();
    setTimeout(createBot, CONFIG.reconnectDelay);
  });
}

// ─── OWNER COMMANDS ────────────────────────────────────
function handleOwnerCommand(username, msg, raw) {
  if (msg === '!stop') {
    isFollowing = false;
    bot.pathfinder.stop();
    bot.chat('Stopped.');
    log('Owner stopped bot movement', 'cmd');
  }

  if (msg === '!come') {
    const player = bot.players[username];
    if (player?.entity) {
      isFollowing = false;
      const { x, y, z } = player.entity.position;
      bot.pathfinder.setGoal(new GoalNear(x, y, z, 2));
      bot.chat('Coming!');
      action('Walking to owner', '🏃', '#1a2e40');
    }
  }

  if (msg.startsWith('!follow')) {
    const target = msg.split(' ')[1] || username;
    isFollowing = true;
    followTarget = target;
    bot.chat(`Following ${target}!`);
    action(`Following ${target}`, '👣', '#1a2040');
  }

  if (msg === '!unfollow') {
    isFollowing = false;
    followTarget = null;
    bot.pathfinder.stop();
    bot.chat('Stopped following.');
  }

  if (msg === '!pos') {
    const p = bot.entity.position;
    bot.chat(`X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
  }

  if (msg === '!health') {
    bot.chat(`HP: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20`);
  }

  if (msg === '!burst') triggerBurst();

  if (msg.startsWith('!say ')) {
    bot.chat(raw.slice(5));
  }

  if (msg === '!armor') autoEquipArmor();
}

// ─── FOLLOW LOOP ───────────────────────────────────────
setInterval(() => {
  if (!bot || !isFollowing || !followTarget) return;
  const player = bot.players[followTarget];
  if (player?.entity) {
    const { x, y, z } = player.entity.position;
    bot.pathfinder.setGoal(new GoalNear(x, y, z, 3), true);
  }
}, 1000);

// ─── PATHFINDER ────────────────────────────────────────
function setupMovements() {
  const move = new Movements(bot);
  move.canDig = false;
  move.allow1by1towers = false;
  bot.pathfinder.setMovements(move);
}

// ─── ANTI-AFK ──────────────────────────────────────────
function startAntiAFK() {
  const dirs = ['forward', 'back', 'left', 'right'];

  // Movement
  intervals.push(setInterval(() => {
    if (isFollowing) return;
    dirs.forEach(d => bot.setControlState(d, false));
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    bot.setControlState(dir, true);
    action(`Moving ${dir}`, '🏃', '#1a2e40');
    setTimeout(() => {
      bot.setControlState(dir, false);
      action('Idle', '•', '#1e2330');
    }, rand(500, 2000));
  }, rand(4000, 9000)));

  // Jumping
  intervals.push(setInterval(() => {
    if (isFollowing) return;
    bot.setControlState('jump', true);
    action('Jumping', '↗', '#1a2040');
    setTimeout(() => bot.setControlState('jump', false), 250);
  }, rand(6000, 15000)));

  // Look around
  intervals.push(setInterval(() => {
    const yaw = Math.random() * Math.PI * 2 - Math.PI;
    const pitch = Math.random() * 0.8 - 0.4;
    bot.look(yaw, pitch, false);
    botStats.pitch = pitch;
    botStats.yaw = yaw;
    action('Looking around', '👁', '#2a1e40');
  }, rand(3000, 7000)));

  // Swing arm
  intervals.push(setInterval(() => {
    bot.swingArm();
    action('Swinging arm', '💪', '#1e2a1a');
  }, rand(5000, 12000)));

  // Sneak
  intervals.push(setInterval(() => {
    bot.setControlState('sneak', true);
    action('Sneaking', '🥾', '#1e1a2a');
    setTimeout(() => {
      bot.setControlState('sneak', false);
      action('Idle', '•', '#1e2330');
    }, rand(400, 1200));
  }, rand(10000, 20000)));
}

// ─── BURST MOVEMENT ────────────────────────────────────
function triggerBurst() {
  const dirs = ['forward', 'back', 'left', 'right'];
  let i = 0;
  log('Burst anti-AFK triggered!', 'warn');
  action('Burst movement!', '💥', '#2d2010');
  const iv = setInterval(() => {
    dirs.forEach(d => bot.setControlState(d, false));
    bot.setControlState(dirs[i % 4], true);
    bot.setControlState('jump', true);
    setTimeout(() => {
      bot.setControlState(dirs[i % 4], false);
      bot.setControlState('jump', false);
    }, 500);
    i++;
    if (i >= 8) clearInterval(iv);
  }, 700);
}

// ─── SURVIVAL ──────────────────────────────────────────
function startSurvival() {
  intervals.push(setInterval(() => {
    if (!bot || bot.food >= 18) return;
    const food = bot.inventory.items().find(item =>
      ['bread','cooked_beef','cooked_chicken','cooked_porkchop',
       'apple','carrot','golden_apple','cooked_mutton'].some(f => item.name.includes(f))
    );
    if (food) {
      bot.equip(food, 'hand').then(() => {
        bot.consume().catch(() => {});
        action('Eating food', '🍞', '#2a2010');
        log(`Eating ${food.name}`, 'info');
      }).catch(() => {});
    }
  }, 5000));
}

function autoEquipArmor() {
  if (!bot) return;
  const slots = {
    head: ['netherite_helmet','diamond_helmet','iron_helmet','golden_helmet','chainmail_helmet','leather_helmet'],
    torso: ['netherite_chestplate','diamond_chestplate','iron_chestplate','golden_chestplate','chainmail_chestplate','leather_chestplate'],
    legs: ['netherite_leggings','diamond_leggings','iron_leggings','golden_leggings','chainmail_leggings','leather_leggings'],
    feet: ['netherite_boots','diamond_boots','iron_boots','golden_boots','chainmail_boots','leather_boots'],
  };
  for (const [dest, priority] of Object.entries(slots)) {
    for (const name of priority) {
      const piece = bot.inventory.items().find(i => i.name === name);
      if (piece) { bot.equip(piece, dest).catch(() => {}); break; }
    }
  }
  log('Auto-equipped best armor', 'info');
  action('Equipping armor', '🛡', '#1a2e40');
}

// ─── STATS BROADCAST ───────────────────────────────────
function startStatsBroadcast() {
  intervals.push(setInterval(() => {
    if (!bot?.entity) return;
    const { x, y, z } = bot.entity.position;
    botStats = {
      ...botStats,
      health: bot.health,
      food: bot.food,
      pos: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10 },
      pitch: bot.entity.pitch,
      yaw: bot.entity.yaw,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      status: 'online',
    };
    broadcast({ stats: botStats });
  }, 500));
}

// ─── DASHBOARD WS COMMANDS ─────────────────────────────
wss.on('connection', (ws) => {
  log('Dashboard connected', 'info');
  ws.send(JSON.stringify({ stats: botStats }));

  ws.on('message', (raw) => {
    try {
      const { cmd, msg } = JSON.parse(raw.toString());
      if (!bot) return;
      switch (cmd) {
        case 'chat': if (msg) { bot.chat(msg); log(`Dashboard chat: ${msg}`, 'cmd'); } break;
        case 'burst': triggerBurst(); break;
        case 'stop': isFollowing = false; bot.pathfinder?.stop(); log('Movement stopped via dashboard', 'cmd'); break;
        case 'reconnect': bot.quit(); break;
        case 'armor': autoEquipArmor(); break;
        case 'pos': {
          const p = bot.entity?.position;
          if (p) log(`Position: ${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`, 'info');
          break;
        }
      }
    } catch (e) {}
  });
});

// ─── UTILS ─────────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min)) + min; }
function clearAllIntervals() { intervals.forEach(clearInterval); intervals = []; }

// ─── START ─────────────────────────────────────────────
createBot();
