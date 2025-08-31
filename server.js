const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));
app.use(express.json({ limit: '20mb' }));

const accountsFile = path.join(__dirname, 'accounts.json');
const mainChatFile = path.join(__dirname, 'mainChat.json');
const privateChatFile = path.join(__dirname, 'privateChat.json');

// Initialize files if they don't exist
if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));
if (!fs.existsSync(mainChatFile)) fs.writeFileSync(mainChatFile, JSON.stringify([]));
if (!fs.existsSync(privateChatFile)) fs.writeFileSync(privateChatFile, JSON.stringify({}));

function loadJSON(path) { return JSON.parse(fs.readFileSync(path)); }
function saveJSON(path, data) { fs.writeFileSync(path, JSON.stringify(data, null, 2)); }
function duoKey(a,b){ return [a,b].sort().join('_'); }

const online = new Map();

// ------------------ ACCOUNTS ------------------
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send({ error: 'Vul alles in' });
  const accounts = loadJSON(accountsFile);
  if (accounts.find(a=>a.username===username)) return res.status(400).send({ error: 'Gebruikersnaam bestaat al' });
  const hashed = await bcrypt.hash(password, 10);
  accounts.push({ username, password: hashed, friends: [], friendRequests: [] });
  saveJSON(accountsFile, accounts);
  res.send({ message: 'Account aangemaakt!' });
});

app.post('/login', async (req,res)=>{
  const { username, password } = req.body;
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u=>u.username===username);
  if(!user) return res.status(400).send({error:'Gebruiker niet gevonden'});
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).send({error:'Fout wachtwoord'});
  res.send({message:'Inloggen gelukt!'});
});

app.get('/getFriends/:username',(req,res)=>{
  const accounts = loadJSON(accountsFile);
  const user = accounts.find(u=>u.username===req.params.username);
  if(!user) return res.status(400).send({error:'Gebruiker niet gevonden'});
  res.send({friends:user.friends||[], friendRequests:user.friendRequests||[]});
});

app.post('/sendFriendRequest',(req,res)=>{
  const { from, to } = req.body;
  if(!from||!to) return res.status(400).send({error:'Onvolledige data'});
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find(u=>u.username===from);
  const receiver = accounts.find(u=>u.username===to);
  if(!sender||!receiver) return res.status(400).send({error:'Gebruiker niet gevonden'});
  if(from===to) return res.status(400).send({error:'Je kunt jezelf geen verzoek sturen'});
  if((receiver.friends||[]).includes(from)) return res.status(400).send({error:'Jullie zijn al vrienden'});
  receiver.friendRequests = receiver.friendRequests||[];
  if(receiver.friendRequests.includes(from)) return res.status(400).send({error:'Verzoek al verstuurd'});
  receiver.friendRequests.push(from);
  saveJSON(accountsFile, accounts);
  const sock = online.get(to);
  if(sock) io.to(sock).emit('friend request',{from});
  res.send({message:'Verzoek verstuurd!'});
});

app.post('/respondFriendRequest',(req,res)=>{
  const { from, to, accept } = req.body;
  if(!from||!to) return res.status(400).send({error:'Onvolledige data'});
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find(u=>u.username===from);
  const receiver = accounts.find(u=>u.username===to);
  if(!sender||!receiver) return res.status(400).send({error:'Gebruiker niet gevonden'});

  receiver.friendRequests = (receiver.friendRequests||[]).filter(x=>x!==from);
  if(accept){
    receiver.friends = receiver.friends||[];
    sender.friends = sender.friends||[];
    if(!receiver.friends.includes(from)) receiver.friends.push(from);
    if(!sender.friends.includes(to)) sender.friends.push(to);
  }
  saveJSON(accountsFile, accounts);

  const rs = online.get(to); if(rs) io.to(rs).emit('friends updated');
  const ss = online.get(from); if(ss) io.to(ss).emit('friends updated');
  res.send({message: accept?'Vriendschap geaccepteerd':'Vriendschap geweigerd'});
});

// ------------------ SOCKET.IO ------------------
io.on('connection',(socket)=>{
  console.log('Socket connected:', socket.id);

  socket.on('set username',(uname)=>{
    socket.username=uname;
    online.set(uname,socket.id);

    // Main chat
    const main = loadJSON(mainChatFile);
    socket.emit('chat history', main);

    // Private chats
    const allPrivate = loadJSON(privateChatFile);
    const userThreads = {};
    for(const k in allPrivate){
      if(k.includes(uname)) userThreads[k] = allPrivate[k];
    }
    socket.emit('load private chats', userThreads);
  });

  // GENERAL MESSAGE
  socket.on('chat message',(data)=>{
    const msg={id:Date.now(),...data};
    if(data.privateTo){
      const accounts = loadJSON(accountsFile);
      const me = accounts.find(u=>u.username===socket.username);
      const other = accounts.find(u=>u.username===data.privateTo);
      if(!me||!other) return;
      if(!((me.friends||[]).includes(other.username) && (other.friends||[]).includes(me.username))) return;
      const key = duoKey(socket.username, data.privateTo);
      const allPrivate = loadJSON(privateChatFile);
      if(!allPrivate[key]) allPrivate[key]=[];
      allPrivate[key].push(msg);
      saveJSON(privateChatFile, allPrivate);
      io.to(socket.id).emit('private message', msg);
      const otherSock = online.get(data.privateTo);
      if(otherSock) io.to(otherSock).emit('private message', msg);
    }else{
      const allMain = loadJSON(mainChatFile);
      allMain.push(msg);
      saveJSON(mainChatFile, allMain);
      io.emit('chat message', msg);
    }
  });

  // DELETE GENERAL MESSAGE
  socket.on('delete message',(id)=>{
    let allMain = loadJSON(mainChatFile);
    const msg = allMain.find(m=>m.id===id);
    if(!msg||msg.user!==socket.username) return;
    allMain = allMain.filter(m=>m.id!==id);
    saveJSON(mainChatFile, allMain);
    io.emit('message deleted', id);
  });

  // DELETE PRIVATE MESSAGE
  socket.on('delete private message',({id,to})=>{
    const key=duoKey(socket.username,to);
    const allPrivate=loadJSON(privateChatFile);
    if(!allPrivate[key]) return;
    const msg = allPrivate[key].find(m=>m.id===id);
    if(!msg||msg.user!==socket.username) return;
    allPrivate[key]=allPrivate[key].filter(m=>m.id!==id);
    saveJSON(privateChatFile, allPrivate);
    const otherSock = online.get(to);
    io.to(socket.id).emit('private message deleted',{id,to});
    if(otherSock) io.to(otherSock).emit('private message deleted',{id,to});
  });

  socket.on('disconnect',()=>{
    if(socket.username) online.delete(socket.username);
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT||3000;
http.listen(PORT,()=>console.log(`Server draait op http://localhost:${PORT}`));
