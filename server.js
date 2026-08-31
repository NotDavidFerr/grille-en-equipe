const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;

// ---------------- Puzzle data (mirrors the client) ----------------
const PUZZLES = [
  {
    id: 'p1',
    rows: 5, cols: 7,
    cells: {
      '0-2': { type: 'clue', dir: 'down', text: 'Meuble pour dormir' },
      '0-3': { type: 'clue', dir: 'down', text: 'Copain, pas de la famille' },
      '0-4': { type: 'clue', dir: 'down', text: 'Lieu avec des trains' },
      '1-0': { type: 'clue', dir: 'right', text: "Bord de mer où l'on se baigne" },
      '1-1': { type: 'letter', answer: 'P' },
      '1-2': { type: 'letter', answer: 'L' },
      '1-3': { type: 'letter', answer: 'A' },
      '1-4': { type: 'letter', answer: 'G' },
      '1-5': { type: 'letter', answer: 'E' },
      '2-2': { type: 'letter', answer: 'I' },
      '2-3': { type: 'letter', answer: 'M' },
      '2-4': { type: 'letter', answer: 'A' },
      '3-2': { type: 'letter', answer: 'T' },
      '3-3': { type: 'letter', answer: 'I' },
      '3-4': { type: 'letter', answer: 'R' },
      '4-3': { type: 'clue', dir: 'right', text: 'Saison chaude' },
      '4-4': { type: 'letter', answer: 'E' },
      '4-5': { type: 'letter', answer: 'T' },
      '4-6': { type: 'letter', answer: 'E' },
    }
  }
];

const PLAYER_COLORS = ['#C98A3A', '#4F7959', '#4468A6', '#A6467A'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = {}; // code -> room

function genCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  if (rooms[s]) return genCode();
  return s;
}

function letterCells(puzzle) {
  return Object.keys(puzzle.cells).filter(k => puzzle.cells[k].type === 'letter');
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ---- static file: the game page ----
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('Erreur serveur'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // ---- API ----
  if (parts[0] === 'api' && parts[1] === 'rooms') {
    // POST /api/rooms  -> create room
    if (req.method === 'POST' && parts.length === 2) {
      const code = genCode();
      const room = {
        code,
        puzzleId: PUZZLES[0].id,
        players: [],
        grid: {},
        status: 'lobby',
        startedAt: null,
        finishedAt: null,
        score: null,
        elapsed: null,
      };
      rooms[code] = room;
      sendJSON(res, 200, room);
      return;
    }

    if (parts.length >= 3) {
      const code = parts[2].toUpperCase();
      const room = rooms[code];

      // GET /api/rooms/:code -> fetch current state (used for polling)
      if (req.method === 'GET' && parts.length === 3) {
        if (!room) { sendJSON(res, 404, { error: 'not_found' }); return; }
        sendJSON(res, 200, room);
        return;
      }

      // POST /api/rooms/:code/join {name}
      if (req.method === 'POST' && parts[3] === 'join') {
        if (!room) { sendJSON(res, 404, { error: 'not_found' }); return; }
        const body = await readBody(req);
        const usedColors = room.players.map(p => p.color);
        const color = PLAYER_COLORS.find(c => !usedColors.includes(c))
          || PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
        const id = 'u' + Math.random().toString(36).slice(2, 10);
        const isHost = room.players.length === 0;
        const name = (body.name || 'Joueur').toString().slice(0, 16);
        room.players.push({ id, name, color, host: isHost });
        sendJSON(res, 200, { room, playerId: id });
        return;
      }

      // POST /api/rooms/:code/start
      if (req.method === 'POST' && parts[3] === 'start') {
        if (!room) { sendJSON(res, 404, { error: 'not_found' }); return; }
        room.status = 'playing';
        room.startedAt = Date.now();
        sendJSON(res, 200, room);
        return;
      }

      // POST /api/rooms/:code/cell {key, letter, playerId, color}
      if (req.method === 'POST' && parts[3] === 'cell') {
        if (!room) { sendJSON(res, 404, { error: 'not_found' }); return; }
        const body = await readBody(req);
        const puzzle = PUZZLES.find(p => p.id === room.puzzleId) || PUZZLES[0];
        const def = puzzle.cells[body.key];
        if (def && def.type === 'letter') {
          if (!body.letter) delete room.grid[body.key];
          else room.grid[body.key] = { letter: String(body.letter).toUpperCase().slice(0, 1), by: body.playerId, color: body.color };
        }
        if (room.status === 'playing') {
          const cells = letterCells(puzzle);
          const allCorrect = cells.every(k => room.grid[k] && room.grid[k].letter === puzzle.cells[k].answer);
          if (allCorrect) {
            room.status = 'finished';
            room.finishedAt = Date.now();
            const elapsed = Math.max(1, Math.round((room.finishedAt - room.startedAt) / 1000));
            room.elapsed = elapsed;
            room.score = Math.max(50, 1000 - elapsed * 8);
          }
        }
        sendJSON(res, 200, room);
        return;
      }

      // POST /api/rooms/:code/reset
      if (req.method === 'POST' && parts[3] === 'reset') {
        if (!room) { sendJSON(res, 404, { error: 'not_found' }); return; }
        room.status = 'lobby';
        room.grid = {};
        room.startedAt = null;
        room.finishedAt = null;
        room.score = null;
        room.elapsed = null;
        sendJSON(res, 200, room);
        return;
      }
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Page non trouvée');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('✓ Serveur lancé sur le port ' + PORT + '.');
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log('  Accessible en ligne à : ' + process.env.RENDER_EXTERNAL_URL);
  } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log('  Accessible en ligne à : https://' + process.env.RAILWAY_PUBLIC_DOMAIN);
  } else {
    console.log('  En local : http://localhost:' + PORT);
    const ips = getLocalIPs();
    if (ips.length) {
      console.log('  Sur le même Wifi :');
      ips.forEach(ip => console.log('    http://' + ip + ':' + PORT));
    }
  }
  console.log('');
});
