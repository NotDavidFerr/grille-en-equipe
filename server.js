const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;

// ---------------- Puzzle data (loaded from data/puzzles.json) ----------------
const DATA_PATH = path.join(__dirname, 'data', 'puzzles.json');

function validatePuzzle(p) {
  const problems = [];
  if (!p || typeof p !== 'object') return ['objet invalide'];
  if (!p.id) problems.push('id manquant');
  if (!p.rows || !p.cols) problems.push('rows/cols manquant');
  if (!p.cells || typeof p.cells !== 'object') { problems.push('cells manquant'); return problems; }
  Object.keys(p.cells).forEach((key) => {
    const m = /^(\d+)-(\d+)$/.exec(key);
    if (!m) { problems.push('clé de case invalide: ' + key); return; }
    const r = Number(m[1]), c = Number(m[2]);
    if (r < 0 || r >= p.rows || c < 0 || c >= p.cols) problems.push('case hors grille: ' + key);
    const cell = p.cells[key];
    if (!cell || typeof cell !== 'object') { problems.push('case invalide: ' + key); return; }
    if (cell.type === 'letter') {
      if (!cell.answer || String(cell.answer).length !== 1) problems.push('lettre invalide en ' + key);
    } else if (cell.type === 'clue') {
      if (!cell.text) problems.push('définition manquante en ' + key);
      if (cell.dir !== 'right' && cell.dir !== 'down') problems.push('direction invalide en ' + key);
    } else {
      problems.push('type de case inconnu en ' + key);
    }
  });
  return problems;
}

function loadPuzzles() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_PATH, 'utf8');
  } catch (e) {
    console.error('✗ Impossible de lire data/puzzles.json :', e.message);
    return [];
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    console.error('✗ data/puzzles.json contient du JSON invalide :', e.message);
    return [];
  }
  if (!Array.isArray(list)) {
    console.error('✗ data/puzzles.json doit contenir un tableau de grilles.');
    return [];
  }
  const valid = [];
  const seenIds = new Set();
  list.forEach((p, idx) => {
    const problems = validatePuzzle(p);
    if (p && p.id && seenIds.has(p.id)) problems.push('id en double: ' + p.id);
    if (problems.length) {
      console.warn('⚠ Grille ignorée (' + (p && p.id ? p.id : 'index ' + idx) + ') : ' + problems.join('; '));
    } else {
      seenIds.add(p.id);
      valid.push(p);
    }
  });
  return valid;
}

const PUZZLES = loadPuzzles();
console.log('✓ ' + PUZZLES.length + ' grille(s) chargée(s) depuis data/puzzles.json : ' + PUZZLES.map(p => p.id).join(', '));
if (PUZZLES.length === 0) {
  console.error('✗ Aucune grille valide — la création de salle échouera tant que data/puzzles.json ne contient pas au moins une grille correcte.');
}

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
  if (req.method === 'GET' && url.pathname === '/api/puzzles') {
    sendJSON(res, 200, PUZZLES);
    return;
  }

  if (parts[0] === 'api' && parts[1] === 'rooms') {
    // POST /api/rooms  -> create room
    if (req.method === 'POST' && parts.length === 2) {
      if (PUZZLES.length === 0) {
        sendJSON(res, 500, { error: 'no_puzzles', message: "Aucune grille disponible côté serveur (data/puzzles.json)." });
        return;
      }
      const code = genCode();
      const puzzle = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
      const room = {
        code,
        puzzleId: puzzle.id,
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
        if (PUZZLES.length > 0) {
          const puzzle = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
          room.puzzleId = puzzle.id;
        }
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
