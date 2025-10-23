// server.js - versión corregida (copia completa)
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Ficheros / carpetas necesarias
const DATOS_DIR = path.join(__dirname, 'datos');
if (!fs.existsSync(DATOS_DIR)) fs.mkdirSync(DATOS_DIR, { recursive: true });

const ARCHIVO_CHATS = path.join(DATOS_DIR, 'chats.json');
if (!fs.existsSync(ARCHIVO_CHATS)) fs.writeFileSync(ARCHIVO_CHATS, JSON.stringify({ chats: [] }, null, 2), 'utf8');

const ARCHIVO_ARTICULOS = path.join(__dirname, 'articulos.json');
if (!fs.existsSync(ARCHIVO_ARTICULOS)) fs.writeFileSync(ARCHIVO_ARTICULOS, JSON.stringify([], null, 2), 'utf8');

const RUTA_IDS = path.join(__dirname, 'ids.txt');

// Multer para uploads
const UPLOADS = path.join(PUBLIC_DIR, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.\-]/g, '');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

// Util: leer/guardar chats
function leerChats() {
  try {
    const raw = fs.readFileSync(ARCHIVO_CHATS, 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && Array.isArray(parsed.chats)) ? parsed : { chats: [] };
  } catch (err) {
    console.warn('leerChats: error, devolviendo {chats:[]}', err);
    return { chats: [] };
  }
}
function guardarChats(data) {
  fs.writeFileSync(ARCHIVO_CHATS, JSON.stringify(data, null, 2), 'utf8');
}

// --- rutas útiles ---
app.get('/favicon.ico', (req, res) => {
  const f = path.join(PUBLIC_DIR, 'favicon.ico');
  if (fs.existsSync(f)) return res.sendFile(f);
  return res.status(204).end();
});

// Devuelve lista de artículos
app.get('/articulos', (req, res) => {
  try {
    if (!fs.existsSync(ARCHIVO_ARTICULOS)) {
      fs.writeFileSync(ARCHIVO_ARTICULOS, JSON.stringify([], null, 2), 'utf8');
      return res.json([]);
    }
    const raw = fs.readFileSync(ARCHIVO_ARTICULOS, 'utf8');
    const datos = JSON.parse(raw);
    return res.json(Array.isArray(datos) ? datos : []);
  } catch (err) {
    console.error('/articulos error', err);
    return res.status(500).json({ error: 'Error al cargar artículos' });
  }
});

// Verificar id
app.post('/verificar-id', (req, res) => {
  try {
    if (!req.body || typeof req.body.id !== 'string') return res.status(400).json({ acceso: false, mensaje: 'ID inválida (formato).' });
    if (!fs.existsSync(RUTA_IDS)) return res.status(500).json({ acceso: false, mensaje: 'Archivo de IDs no encontrado.' });
    const raw = fs.readFileSync(RUTA_IDS, 'utf8');
    const lista = JSON.parse(raw);
    if (!Array.isArray(lista)) return res.status(500).json({ acceso: false, mensaje: 'Formato interno incorrecto.' });
    const existe = lista.some(u => u.id === req.body.id.trim());
    return res.json({ acceso: !!existe });
  } catch (err) {
    console.error('/verificar-id', err);
    return res.status(500).json({ acceso: false, mensaje: 'Error interno' });
  }
});

// Verificar acceso (id + contraseña)
app.post('/verificar-acceso', (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ acceso: false, mensaje: 'Faltan campos.' });
    if (!fs.existsSync(RUTA_IDS)) return res.status(500).json({ acceso: false, mensaje: 'Archivo de IDs no encontrado.' });
    const raw = fs.readFileSync(RUTA_IDS, 'utf8');
    const usuarios = JSON.parse(raw);
    if (!Array.isArray(usuarios)) return res.status(500).json({ acceso: false, mensaje: 'Formato ids.txt inválido' });
    const coincide = usuarios.find(u => u.id === id.trim() && u.contraseña === password.trim());
    return res.json({ acceso: !!coincide, mensaje: coincide ? undefined : 'ID o contraseña incorrectos.' });
  } catch (err) {
    console.error('/verificar-acceso', err);
    return res.status(500).json({ acceso: false, mensaje: 'Error interno' });
  }
});

// Obtener usuarios (lista pública desde ids.txt)
app.post('/obtener-usuarios', (req, res) => {
  try {
    if (!fs.existsSync(RUTA_IDS)) return res.json({ ok: true, usuarios: [] });
    const raw = fs.readFileSync(RUTA_IDS, 'utf8');
    const usuarios = JSON.parse(raw);
    if (!Array.isArray(usuarios)) return res.status(500).json({ ok: false, error: 'Formato de usuarios inválido' });
    const listaPublica = usuarios.map(u => ({ id: u.id, nombre: u.nombre || u.displayName || u.id }));
    return res.json({ ok: true, usuarios: listaPublica });
  } catch (err) {
    console.error('/obtener-usuarios', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});
app.get('/obtener-usuarios', (req, res) => res.status(405).json({ ok: false, error: 'Usa POST' }));

// Obtener chats de un usuario
app.post('/obtener-chats', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') return res.status(400).json({ ok: false, error: "userId faltante o inválido" });
    const data = leerChats();
    const propios = data.chats.filter(c => Array.isArray(c.miembros) && c.miembros.includes(userId));
    return res.json({ ok: true, chats: propios });
  } catch (err) {
    console.error('/obtener-chats', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Crear-grupo (simple)
app.post('/crear-grupo', (req, res) => {
  try {
    const { creador, miembros, displayName } = req.body;
    if (!creador || !Array.isArray(miembros) || miembros.length === 0) return res.status(400).json({ ok: false, error: 'Faltan campos' });
    const data = leerChats();
    const miembrosUnicos = Array.from(new Set([creador, ...miembros]));
    const id = `chat-${miembrosUnicos.join('-')}-${Date.now()}`;
    const nuevoChat = { id, chat: miembrosUnicos.join(' - '), displayName: displayName || `${miembrosUnicos[0]} & ${miembrosUnicos.slice(1).join(', ')}`, miembros: miembrosUnicos, mensajes: [{ id: `m${Date.now()}`, de: creador, mensaje: 'Grupo creado', timestamp: Date.now() }] };
    data.chats.push(nuevoChat);
    guardarChats(data);
    return res.json({ ok: true, chat: nuevoChat });
  } catch (err) {
    console.error('/crear-grupo', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Añadir miembros (POST /anadir-miembros) - nota: sin ñ en URL
app.post('/anadir-miembros', (req, res) => {
  try {
    const { usuario, chatKey, nuevosMiembros } = req.body;
    if (!usuario || !chatKey || !Array.isArray(nuevosMiembros) || nuevosMiembros.length === 0) return res.status(400).json({ ok: false, error: 'Faltan campos' });
    const data = leerChats();
    let chat = data.chats.find(c => c.id === chatKey || c.chat === chatKey);
    if (!chat) return res.status(404).json({ ok: false, error: 'Chat no encontrado' });
    if (!chat.miembros.includes(usuario)) return res.status(403).json({ ok: false, error: 'No autorizado' });
    const nuevos = nuevosMiembros.filter(m => !chat.miembros.includes(m));
    if (nuevos.length === 0) return res.json({ ok: true, message: 'No hay miembros nuevos para añadir' });
    chat.miembros = Array.from(new Set([...chat.miembros, ...nuevos]));
    chat.mensajes.push({ id: `m${Date.now()}`, de: 'system', mensaje: `Se añadieron: ${nuevos.join(', ')}`, timestamp: Date.now() });
    guardarChats(data);
    return res.json({ ok: true, añadidos: nuevos, chat });
  } catch (err) {
    console.error('/anadir-miembros', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// RENOMBRAR GRUPO (esta es la ruta que te da 404)
app.post('/renombrar-grupo', (req, res) => {
  try {
    const { usuario, chatKey, nuevoNombre } = req.body;
    if (!usuario || !chatKey || !nuevoNombre) return res.status(400).json({ ok: false, error: 'Faltan campos' });
    const data = leerChats();
    const chat = data.chats.find(c => c.id === chatKey || c.chat === chatKey);
    if (!chat) return res.status(404).json({ ok: false, error: 'Chat no encontrado' });
    if (!chat.miembros.includes(usuario)) return res.status(403).json({ ok: false, error: 'No autorizado' });
    chat.displayName = nuevoNombre;
    guardarChats(data);
    return res.json({ ok: true, chat });
  } catch (err) {
    console.error('/renombrar-grupo', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Guardar mensaje (fallback sin socket)
app.post('/guardar-mensaje', (req, res) => {
  try {
    let chatId = req.body.chatId || req.body.chat || req.body.chatKey || req.body.chat_id;
    let mensaje = req.body.mensaje;
    const usuario = req.body.usuario;
    const de = req.body.de;
    if (!mensaje && req.body.text) mensaje = req.body.text;
    if (typeof mensaje === 'string') mensaje = { de: de || usuario || 'unknown', mensaje: mensaje, timestamp: Date.now() };
    if (mensaje && typeof mensaje === 'object') {
      if (!mensaje.de) mensaje.de = de || usuario || 'unknown';
      if (!mensaje.timestamp) mensaje.timestamp = Date.now();
    }
    if (!chatId || !mensaje || !mensaje.de || !mensaje.mensaje) return res.status(400).json({ ok: false, error: 'Faltan datos' });
    const data = leerChats();
    let chatObj = data.chats.find(c => c.id === chatId);
    if (!chatObj) chatObj = data.chats.find(c => c.chat === chatId || c.id === (chatId.id || ''));
    if (!chatObj) return res.status(404).json({ ok: false, error: 'Chat no encontrado' });
    chatObj.mensajes.push({ id: `m${Date.now()}`, de: mensaje.de, mensaje: mensaje.mensaje, timestamp: mensaje.timestamp || Date.now() });
    guardarChats(data);
    return res.json({ ok: true });
  } catch (err) {
    console.error('/guardar-mensaje', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Guardar artículo (multipart o json)
app.post('/guardar-articulo', upload.single('imagen'), (req, res) => {
  try {
    const { body, file } = req;
    const titulo = body.titulo || body.title || 'Sin título';
    const descripcion = body.descripcion || body.description || '';
    const precio = body.precio ? Number(body.precio) : (body.price ? Number(body.price) : null);
    let nombreImagen = null;
    if (file && file.filename) nombreImagen = path.basename(file.filename);
    else if (body.imagen) nombreImagen = body.imagen;
    let articulos = [];
    try {
      const raw = fs.readFileSync(ARCHIVO_ARTICULOS, 'utf8');
      articulos = JSON.parse(raw);
      if (!Array.isArray(articulos)) articulos = [];
    } catch (e) { articulos = []; }
    const nuevo = { id: `art-${Date.now()}`, titulo, descripcion, precio: (precio !== null && !isNaN(precio) ? precio : null), imagen: nombreImagen, timestamp: Date.now() };
    articulos.push(nuevo);
    fs.writeFileSync(ARCHIVO_ARTICULOS, JSON.stringify(articulos, null, 2), 'utf8');
    return res.json({ ok: true, articulo: nuevo });
  } catch (err) {
    console.error('/guardar-articulo', err);
    return res.status(500).json({ ok: false, error: 'Error interno al guardar artículo' });
  }
});

// Endpoint diagnóstico: lista todas las rutas registradas
app.get('/__routes', (req, res) => {
  try {
    const routes = [];
    app._router.stack.forEach(m => {
      if (m.route && m.route.path) {
        routes.push({ path: m.route.path, methods: Object.keys(m.route.methods) });
      }
    });
    return res.json({ ok: true, routes });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'No pude listar rutas' });
  }
});

// socket.io (opcional)
io.on('connection', socket => {
  console.log('[socket] conectado', socket.id);
  socket.on('joinChat', ({ chatId }) => socket.join(chatId));
  socket.on('nuevoMensaje', ({ chatId, mensaje }) => {
    const data = leerChats();
    let chat = data.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.mensajes.push({ id: `m${Date.now()}`, de: mensaje.de, mensaje: mensaje.mensaje, timestamp: mensaje.timestamp || Date.now() });
    guardarChats(data);
    io.to(chatId).emit('recibirMensaje', mensaje);
  });
  socket.on('disconnect', () => console.log('[socket] desconectado', socket.id));
});


// Fallback para peticiones no encontradas: devolver JSON si el cliente acepta JSON
app.use((req, res) => {
  if (req.accepts('json')) return res.status(404).json({ ok: false, error: 'Not found' });
  return res.status(404).type('txt').send('Not found');
});

// Start
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
