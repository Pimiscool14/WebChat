const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));
app.use(express.json({ limit: '20mb' }));

// Data-bestanden
const accountsFile = './accounts.json';
const mainChatFile = './mainChat.json';
const privateChatFile = './privateChat.json';

if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));
if (!fs.existsSync(mainChatFile)) fs.writeFileSync(mainChatFile, JSON.stringify([]));
if (!fs.existsSync(privateChatFile)) fs.writeFileSync(privateChatFile, JSON.stringify({}));

// In-memory map: username -> socketId
const online = new Map();

// Helpers
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file));
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function duoKey(a, b) {
  return [a, b].sort().join('_');
}

// ---------- REGISTREREN ----------
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const accounts = loadJSON(accountsFile);

  if (accounts.find(u => u.username === username)) {
    return res.status(400).send({ error: 'Gebruikersnaam bestaat al' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  accounts.push({ username, password: hashedPassword, friends: [], friendRequests: [] });
  saveJSON(accountsFile, accounts);

  res.send({ message: 'Account aangemaakt!' });
});

// ---------- INLOGGEN ----------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u => u.username === username);

  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).send({ error: 'Fout wachtwoord' });

  res.send({ message: 'Inloggen gelukt!' });
});

// ---------- VRIENDEN ----------
app.get('/getFriends/:username', (req, res) => {
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u => u.username === req.params.username);
  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  res.send({ friends: user.friends, friendRequests: user.friendRequests });
});

app.post('/sendFriendRequest', (req, res) => {
  const { from, to } = req.body;
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find(u => u.username === from);
  const receiver = accounts.find(u => u.username === to);

  if (!sender || !receiver) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  if (from === to) return res.status(400).send({ error: 'Je kunt jezelf geen verzoek sturen' });
  if (receiver.friends.includes(from)) return res.status(400).send({ error: 'Jullie zijn al vrienden' });
  if (receiver.friendRequests.includes(from)) return res.status(400).send({ error: 'Verzoek al verstuurd' });

  receiver.friendRequests.push(from);
  saveJSON(accountsFile, accounts);

  // Realtime popup naar ontvanger (indien online)
  const toSocket = online.get(to);
  if (toSocket) {
    io.to(toSocket).emit('friend request', { from });
  }

  res.send({ message: 'Verzoek verstuurd!' });
});

app.post('/respondFriendRequest', (req, res) => {
  const { from, to, accept } = req.body;
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find(u => u.username === from);   // die het verzoek stuurde
  const receiver = accounts.find(u => u.username === to);   // die antwoordt

  if (!sender || !receiver) return res.status(400).send({ error: 'Gebruiker niet gevonden' });

  receiver.friendRequests = receiver.friendRequests.filter(u => u !== from);

  if (accept) {
    if (!receiver.friends.includes(from)) receiver.friends.push(from);
    if (!sender.friends.includes(to)) sender.friends.push(to);
  }

  saveJSON(accountsFile, accounts);

  // Notify beide kanten om lijst te refreshen
  const rSock = online.get(to);
  if (rSock) io.to(rSock).emit('friends updated');
  const sSock = online.get(from);
  if (sSock) io.to(sSock).emit('friends updated');

  res.send({ message: accept ? 'Vriendschap geaccepteerd' : 'Vriendschap geweigerd' });
});

// ---------- SOCKET.IO ----------
io.on('connection', (socket) => {
  console.log('Een gebruiker is verbonden');

  socket.on('set username', (username) => {
    socket.username = username;
    online.set(username, socket.id);

    // Stuur main chat geschiedenis
    const mainMessages = loadJSON(mainChatFile);
    socket.emit('chat history', mainMessages);

    // Stuur alle private threads waar deze user in zit
    const privateMessages = loadJSON(privateChatFile);
    const userPrivate = {};
    for (const key in privateMessages) {
      const [a, b] = key.split('_');
      if (a === username || b === username) {
        userPrivate[key] = privateMessages[key];
      }
    }
    socket.emit('load private chats', userPrivate);
  });

  // Publieke chat
  socket.on('chat message', (data) => {
    // data: { user, msg, type, privateTo? }
    const msg = { id: Date.now(), ...data };

    if (data.privateTo) {
      // PRIVÉ — alleen tussen twee vrienden, en alleen naar die twee emitten
      const accounts = loadJSON(accountsFile);
      const me = accounts.find(u => u.username === socket.username);
      const other = accounts.find(u => u.username === data.privateTo);
      if (!me || !other) return;

      const zijnVrienden = me.friends.includes(other.username) && other.friends.includes(me.username);
      if (!zijnVrienden) return; // niet toestaan

      // Opslaan
      const key = duoKey(socket.username, data.privateTo);
      const allPrivate = loadJSON(privateChatFile);
      if (!allPrivate[key]) allPrivate[key] = [];
      allPrivate[key].push(msg);
      saveJSON(privateChatFile, allPrivate);

      // Alleen naar afzender en ontvanger sturen
      io.to(socket.id).emit('private message', msg);
      const otherSock = online.get(data.privateTo);
      if (otherSock) io.to(otherSock).emit('private message', msg);
    } else {
      // MAIN
      const allMain = loadJSON(mainChatFile);
      allMain.push(msg);
      saveJSON(mainChatFile, allMain);
      io.emit('chat message', msg);
    }
  });

  // Alleen eigen bericht verwijderen (in main chat)
  socket.on('delete message', (id) => {
    let allMain = loadJSON(mainChatFile);
    const msg = allMain.find(m => m.id === id);
    if (!msg || msg.user !== socket.username) return;
    allMain = allMain.filter(m => m.id !== id);
    saveJSON(mainChatFile, allMain);
    io.emit('message deleted', id);
  });

  socket.on('disconnect', () => {
    if (socket.username) online.delete(socket.username);
    console.log('Een gebruiker is weg');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
