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

// ---------- REGISTREREN ----------
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  if(accounts.find(u => u.username === username))
    return res.status(400).send({ error: 'Gebruikersnaam bestaat al' });

  const hashedPassword = await bcrypt.hash(password, 10);
  accounts.push({ username, password: hashedPassword, friends: [], friendRequests: [] });
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  res.send({ message: 'Account aangemaakt!' });
});

// ---------- INLOGGEN ----------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  const user = accounts.find(u => u.username === username);
  if(!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });

  const match = await bcrypt.compare(password, user.password);
  if(!match) return res.status(400).send({ error: 'Fout wachtwoord' });
  res.send({ message: 'Inloggen gelukt!' });
});

// ---------- VRIENDEN ----------
app.post('/sendFriendRequest', (req, res) => {
  const { from, to } = req.body;
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  const receiver = accounts.find(u => u.username === to);
  if (!receiver) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  if (receiver.friends.includes(from) || receiver.friendRequests.includes(from))
    return res.status(400).send({ error: 'Al vriend of verzoek al verstuurd' });

  receiver.friendRequests.push(from);
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  res.send({ message: 'Verzoek verstuurd!' });
});

app.post('/respondFriendRequest', (req, res) => {
  const { from, to, accept } = req.body;
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  const sender = accounts.find(u => u.username === from);
  const receiver = accounts.find(u => u.username === to);
  if (!sender || !receiver) return res.status(400).send({ error: 'Gebruiker niet gevonden' });

  receiver.friendRequests = receiver.friendRequests.filter(u => u !== from);
  if (accept) {
    if (!receiver.friends.includes(from)) receiver.friends.push(from);
    if (!sender.friends.includes(to)) sender.friends.push(to);
  }

  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  res.send({ message: accept ? 'Vriendschap geaccepteerd' : 'Vriendschap geweigerd' });
});

app.get('/getFriends/:username', (req, res) => {
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  const user = accounts.find(u => u.username === req.params.username);
  if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });
  res.send({ friends: user.friends, friendRequests: user.friendRequests });
});

// ---------- SOCKET.IO CHAT ----------
io.on('connection', (socket) => {
  console.log('Een gebruiker is verbonden');

  socket.on('set username', username => socket.username = username);

  // Stuur main chat
  const mainMessages = JSON.parse(fs.readFileSync(mainChatFile));
  socket.emit('chat history', mainMessages);

  // Stuur privé chats voor deze gebruiker
  const privateMessages = JSON.parse(fs.readFileSync(privateChatFile));
  const userPrivate = {};
  for(const key in privateMessages){
    if(key.includes(socket.username)){
      userPrivate[key] = privateMessages[key];
    }
  }
  socket.emit('load private chats', userPrivate);

  // Nieuwe berichten
  socket.on('chat message', data => {
    const msg = { id: Date.now(), ...data };
    if(data.privateTo){
      const key = [socket.username, data.privateTo].sort().join('_');
      let allPrivate = JSON.parse(fs.readFileSync(privateChatFile));
      if(!allPrivate[key]) allPrivate[key] = [];
      allPrivate[key].push(msg);
      fs.writeFileSync(privateChatFile, JSON.stringify(allPrivate, null,2));
      io.emit('private message', msg);
    } else {
      let allMain = JSON.parse(fs.readFileSync(mainChatFile));
      allMain.push(msg);
      fs.writeFileSync(mainChatFile, JSON.stringify(allMain, null,2));
      io.emit('chat message', msg);
    }
  });

  socket.on('delete message', id => {
    let allMain = JSON.parse(fs.readFileSync(mainChatFile));
    const msg = allMain.find(m => m.id === id);
    if(!msg || msg.user !== socket.username) return;
    allMain = allMain.filter(m => m.id !== id);
    fs.writeFileSync(mainChatFile, JSON.stringify(allMain, null,2));
    io.emit('message deleted', id);
  });

  socket.on('disconnect', () => console.log('Een gebruiker is weg'));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));
