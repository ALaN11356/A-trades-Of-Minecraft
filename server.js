// server.js - parcheado para gestión de sesiones, usuarios, artículos, chats y admin
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const APP_ROOT = __dirname;
const DATA_DIR = APP_ROOT;
const IDS_PATH = path.join(APP_ROOT, 'ids.txt');
const ART_PATH = path.join(APP_ROOT, 'articulos.json');
const CHATS_PATH = path.join(APP_ROOT, 'datos', 'chats.json');
const UPLOADS_DIR = path.join(APP_ROOT, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR });
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(APP_ROOT, 'public')));

// In-memory sessions map: sid -> { id, isAdmin }
const sessions = new Map();
const ADMINS = new Set(['ucosuc113','porcat']); // configurar admins aquí

function readJSONSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJSONSafe(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

// Load users from ids.txt (it's a JSON array)
function loadUsers() {
  try {
    const raw = fs.readFileSync(IDS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(IDS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

// Simple auth helpers
function createSession(userId) {
  const sid = crypto.randomBytes(18).toString('hex');
  const isAdmin = ADMINS.has(userId);
  sessions.set(sid, { id: userId, isAdmin, created: Date.now() });
  return { sid, isAdmin };
}

function getSession(req) {
  const sid = req.cookies && req.cookies.sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function requireAuth(req, res, next) {
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ ok: false, error: 'No auth' });
  req.session = ses;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.session.isAdmin) return res.status(403).json({ ok: false, error: 'Admin only' });
    next();
  });
}

// Login endpoint: expects { id, contraseña }
app.post('/api/login', (req, res) => {
  const { id, contraseña } = req.body;
  if (!id || !contraseña) return res.status(400).json({ ok: false, error: 'Missing' });
  const users = loadUsers();
  const found = users.find(u => u.id === id && u.contraseña === contraseña);
  if (!found) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  const { sid, isAdmin } = createSession(id);
  res.cookie('sid', sid, { httpOnly: true });
  res.json({ ok: true, id, isAdmin });
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies && req.cookies.sid;
  if (sid) sessions.delete(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const ses = getSession(req);
  if (!ses) return res.json({ ok: false });
  res.json({ ok: true, id: ses.id, isAdmin: ses.isAdmin });
});

// Articles APIs
app.get('/api/articles', (req, res) => {
  const arts = readJSONSafe(ART_PATH, []);
  res.json(arts);
});

app.post('/api/articles', requireAuth, upload.single('imagen'), (req, res) => {
  const body = req.body;
  const arts = readJSONSafe(ART_PATH, []);
  const nueva = {
    imagen: req.file ? path.basename(req.file.path) : body.imagen || '',
    nombre: body.nombre || 'Sin nombre',
    precio: body.precio || '0',
    descripcion: body.descripcion || '',
    version: body.version || '',
    servidor: body.servidor || '',
    vendedor: req.session.id
  };
  arts.push(nueva);
  writeJSONSafe(ART_PATH, arts);
  res.json({ ok: true, articulo: nueva });
});

app.put('/api/articles/:index', requireAuth, upload.single('imagen'), (req, res) => {
  const idx = Number(req.params.index);
  const arts = readJSONSafe(ART_PATH, []);
  if (Number.isNaN(idx) || idx < 0 || idx >= arts.length) return res.status(404).json({ ok: false, error: 'Not found' });
  const art = arts[idx];
  // Only owner or admin can edit
  if (art.vendedor !== req.session.id && !req.session.isAdmin) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const b = req.body;
  art.nombre = b.nombre || art.nombre;
  art.precio = b.precio || art.precio;
  art.descripcion = b.descripcion || art.descripcion;
  art.version = b.version || art.version;
  art.servidor = b.servidor || art.servidor;
  if (req.file) art.imagen = path.basename(req.file.path);
  writeJSONSafe(ART_PATH, arts);
  res.json({ ok: true, articulo: art });
});

app.delete('/api/articles/:index', requireAuth, (req, res) => {
  const idx = Number(req.params.index);
  const arts = readJSONSafe(ART_PATH, []);
  if (Number.isNaN(idx) || idx < 0 || idx >= arts.length) return res.status(404).json({ ok: false, error: 'Not found' });
  const art = arts[idx];
  if (art.vendedor !== req.session.id && !req.session.isAdmin) return res.status(403).json({ ok: false, error: 'Forbidden' });
  arts.splice(idx, 1);
  writeJSONSafe(ART_PATH, arts);
  res.json({ ok: true });
});

// User management (admin)
app.get('/api/users', requireAdmin, (req, res) => {
  const users = loadUsers();
  res.json(users.map(u => ({ id: u.id }))); // no passwords by default
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { id, contraseña } = req.body;
  if (!id || !contraseña) return res.status(400).json({ ok: false, error: 'Missing' });
  const users = loadUsers();
  if (users.find(u => u.id === id)) return res.status(400).json({ ok: false, error: 'Exists' });
  users.push({ id, contraseña });
  saveUsers(users);
  // Append to file in case other processes read lines (keeps file atomic by rewriting entire file)
  res.json({ ok: true });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const target = req.params.id;
  const { contraseña } = req.body;
  const users = loadUsers();
  const u = users.find(x => x.id === target);
  if (!u) return res.status(404).json({ ok: false, error: 'Not found' });
  if (contraseña) u.contraseña = contraseña;
  saveUsers(users);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const target = req.params.id;
  let users = loadUsers();
  users = users.filter(u => u.id !== target);
  saveUsers(users);
  res.json({ ok: true });
});

// Chats: list and create group
app.get('/api/chats', requireAuth, (req, res) => {
  const chats = readJSONSafe(CHATS_PATH, { chats: [] });
  res.json(chats);
});

app.post('/api/chats', requireAuth, (req, res) => {
  const { miembros, displayName } = req.body;
  if (!Array.isArray(miembros) || miembros.length < 2) return res.status(400).json({ ok: false, error: 'Need at least 2 miembros' });
  // validate members exist
  const users = loadUsers();
  const allIds = new Set(users.map(u => u.id));
  for (const m of miembros) if (!allIds.has(m)) return res.status(400).json({ ok: false, error: `Usuario no encontrado: ${m}` });
  const chatsData = readJSONSafe(CHATS_PATH, { chats: [] });
  // create unique id
  const newId = 'chat-' + Date.now() + '-' + Math.floor(Math.random()*9999);
  const chatObj = { id: newId, chat: miembros.join(' - '), displayName: displayName || miembros.join(' & '), miembros, mensajes: [] };
  chatsData.chats.push(chatObj);
  writeJSONSafe(CHATS_PATH, chatsData);
  res.json({ ok: true, chat: chatObj });
});

// Profile image upload
app.post('/api/profile', requireAuth, upload.single('foto'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });
  // Optionally, save a mapping user -> filename in a simple JSON
  const mapPath = path.join(APP_ROOT, 'datos', 'profiles.json');
  const map = readJSONSafe(mapPath, {});
  map[req.session.id] = path.basename(req.file.path);
  writeJSONSafe(mapPath, map);
  res.json({ ok: true, file: map[req.session.id] });
});

// Get profile image
app.get('/api/profile/:id', (req, res) => {
  const mapPath = path.join(APP_ROOT, 'datos', 'profiles.json');
  const map = readJSONSafe(mapPath, {});
  const fn = map[req.params.id];
  if (!fn) return res.status(404).json({ ok: false, error: 'Not found' });
  res.sendFile(path.join(UPLOADS_DIR, fn));
});

// Start server
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

// Socket.IO basic relay for chats (opcional: mejora incremental)
io.on('connection', socket => {
  console.log('socket connected', socket.id);
  socket.on('join', room => socket.join(room));
  socket.on('msg', data => {
    // data: { room, mensaje, de }
    if (data && data.room) io.to(data.room).emit('msg', data);
  });
});
