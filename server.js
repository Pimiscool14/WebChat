const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json({ limit: '20mb' }));

const accountsFile = './accounts.json';
const mainChatFile = './mainChat.json';
const privateChatFile = './privateChat.json';

if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));
if (!fs.existsSync(mainChatFile)) fs.writeFileSync(mainChatFile, JSON.stringify([]));
if (!fs.existsSync(privateChatFile)) fs.writeFileSync(privateChatFile, JSON.stringify({}));

function loadJSON(path) { return JSON.parse(fs.readFileSync(path)); }
function saveJSON(path, data) { fs.writeFileSync(path, JSON.stringify(data, null, 2)); }
function duoKey(a,b) { return [a,b].sort().join('_'); }

const online = new Map();

// REGISTRATIE
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send({ error: 'Vul alles in' });
  const accounts = loadJSON(accountsFile);
  if (accounts.find(a => a.username === username)) return res.status(400).send({ error: 'Gebruikersnaam bestaat al' });
  const hashed = await bcrypt.hash(password, 10);
  accounts.push({ username, password: hashed, friends: [], friendRequests: [], theme: 'dark' });
  saveJSON(accountsFile, accounts);
  res.send({ message: 'Account aangemaakt!' });
});

// LOGIN
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u => u.username === username);
  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).send({ error: 'Fout wachtwoord' });
  res.send({ message: 'Inloggen gelukt!' });
});

// THEMA ENDPOINTS
app.post('/theme', (req, res) => {
  const { username, theme } = req.body;
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u => u.username === username);
  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  user.theme = theme;
  saveJSON(accountsFile, accounts);
  res.send({ message: 'Thema bijgewerkt!' });
});

app.get('/theme/:username', (req, res) => {
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u => u.username === req.params.username);
  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  res.send({ theme: user.theme || 'dark' });
});

// ALLE overige bestaande routes blijven exact hetzelfde zoals getFriends, sendFriendRequest, respondFriendRequest, socket.io handlers, chat message handlers etc.

/* ... hele rest van je server.js blijft zoals jij hem had ... */

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));
