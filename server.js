// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

app.use(express.static("public"));
app.use(express.json({ limit: "50mb" })); // grote uploads

const accountsFile = path.join(__dirname, "accounts.json");
const mainChatFile = path.join(__dirname, "mainChat.json");
const privateChatFile = path.join(__dirname, "privateChat.json");

// Zorg dat bestanden bestaan
if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));
if (!fs.existsSync(mainChatFile)) fs.writeFileSync(mainChatFile, JSON.stringify([]));
if (!fs.existsSync(privateChatFile)) fs.writeFileSync(privateChatFile, JSON.stringify({}));

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p));
}
function saveJSON(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}
function duoKey(a, b) {
  return [a, b].sort().join("_");
}

const online = new Map(); // username -> socket.id

// =================== ACCOUNTS =====================
app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).send({ error: "Vul alles in" });

  const accounts = loadJSON(accountsFile);
  if (accounts.find((a) => a.username === username))
    return res.status(400).send({ error: "Gebruikersnaam bestaat al" });

  const hashed = await bcrypt.hash(password, 10);
  accounts.push({
    username,
    password: hashed,
    friends: [],
    friendRequests: [],
    admin: false,
    suspended: { status: false, until: null },
  });
  saveJSON(accountsFile, accounts);
  res.send({ message: "Account aangemaakt!" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const accounts = loadJSON(accountsFile);
  const user = accounts.find((u) => u.username === username);
  if (!user) return res.status(400).send({ error: "Gebruiker niet gevonden" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).send({ error: "Fout wachtwoord" });

  const now = Date.now();
  if (user.suspended?.status) {
    if (!user.suspended.until || user.suspended.until > now) {
      return res.status(403).send({ error: "Account is geschorst" });
    } else {
      user.suspended = { status: false, until: null };
      saveJSON(accountsFile, accounts);
    }
  }

  res.send({ message: "Inloggen gelukt!", admin: user.admin });
});

// =================== ADMIN FUNCTIES =====================
function isAdmin(username) {
  const accounts = loadJSON(accountsFile);
  const user = accounts.find((u) => u.username === username);
  return user && user.admin;
}

app.post("/admin/suspend", (req, res) => {
  const { adminUser, targetUser, durationMs } = req.body || {};
  if (!isAdmin(adminUser)) return res.status(403).send({ error: "Geen rechten" });

  const accounts = loadJSON(accountsFile);
  const target = accounts.find((u) => u.username === targetUser);
  if (!target) return res.status(400).send({ error: "Niet gevonden" });

  target.suspended = {
    status: true,
    until: durationMs ? Date.now() + durationMs : null,
  };
  saveJSON(accountsFile, accounts);

  const sock = online.get(targetUser);
  if (sock) io.to(sock).emit("suspended");

  res.send({ message: `${targetUser} is geschorst` });
});

app.post("/admin/unsuspend", (req, res) => {
  const { adminUser, targetUser } = req.body || {};
  if (!isAdmin(adminUser)) return res.status(403).send({ error: "Geen rechten" });

  const accounts = loadJSON(accountsFile);
  const target = accounts.find((u) => u.username === targetUser);
  if (!target) return res.status(400).send({ error: "Niet gevonden" });

  target.suspended = { status: false, until: null };
  saveJSON(accountsFile, accounts);
  res.send({ message: `${targetUser} is weer actief` });
});

// =================== VRIENDEN =====================
app.get("/getFriends/:username", (req, res) => {
  const accounts = loadJSON(accountsFile);
  const user = accounts.find((u) => u.username === req.params.username);
  if (!user) return res.status(400).send({ error: "Niet gevonden" });
  res.send({ friends: user.friends || [], friendRequests: user.friendRequests || [] });
});

app.post("/sendFriendRequest", (req, res) => {
  const { from, to } = req.body || {};
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find((u) => u.username === from);
  const receiver = accounts.find((u) => u.username === to);
  if (!sender || !receiver) return res.status(400).send({ error: "Niet gevonden" });
  if (from === to) return res.status(400).send({ error: "Je kan jezelf geen verzoek sturen" });

  receiver.friendRequests = receiver.friendRequests || [];
  if (!receiver.friendRequests.includes(from)) {
    receiver.friendRequests.push(from);
  }
  saveJSON(accountsFile, accounts);

  const recvSock = online.get(to);
  if (recvSock) io.to(recvSock).emit("friend request", { from });

  res.send({ message: "Verzoek gestuurd!" });
});

app.post("/respondFriendRequest", (req, res) => {
  const { from, to, accept } = req.body || {};
  const accounts = loadJSON(accountsFile);
  const sender = accounts.find((u) => u.username === from);
  const receiver = accounts.find((u) => u.username === to);
  if (!sender || !receiver) return res.status(400).send({ error: "Niet gevonden" });

  receiver.friendRequests = (receiver.friendRequests || []).filter((x) => x !== from);
  if (accept) {
    receiver.friends = receiver.friends || [];
    sender.friends = sender.friends || [];
    if (!receiver.friends.includes(from)) receiver.friends.push(from);
    if (!sender.friends.includes(to)) sender.friends.push(to);

    const key = duoKey(from, to);
    const allPrivate = loadJSON(privateChatFile);
    if (!allPrivate[key]) allPrivate[key] = [];
    saveJSON(privateChatFile, allPrivate);
  }
  saveJSON(accountsFile, accounts);

  res.send({ message: accept ? "Geaccepteerd" : "Geweigerd" });
});

// =================== SOCKET.IO =====================
io.on("connection", (socket) => {
  console.log("Connect:", socket.id);

  socket.on("set username", (uname) => {
    if (!uname) return;
    socket.username = uname;
    online.set(uname, socket.id);

    const main = loadJSON(mainChatFile);
    socket.emit("chat history", main);

    const allPrivate = loadJSON(privateChatFile);
    const userThreads = {};
    for (const k in allPrivate) {
      if (k.includes(uname)) userThreads[k] = allPrivate[k];
    }
    socket.emit("load private chats", userThreads);
  });

  socket.on("chat message", (data) => {
    const msg = { id: Date.now(), ...data };

    if (data.privateTo) {
      const key = duoKey(socket.username, data.privateTo);
      const allPrivate = loadJSON(privateChatFile);
      if (!allPrivate[key]) allPrivate[key] = [];
      allPrivate[key].push(msg);
      saveJSON(privateChatFile, allPrivate);

      io.to(socket.id).emit("private message", msg);
      const otherSock = online.get(data.privateTo);
      if (otherSock) io.to(otherSock).emit("private message", msg);
    } else {
      const allMain = loadJSON(mainChatFile);
      allMain.push(msg);
      saveJSON(mainChatFile, allMain);
      io.emit("chat message", msg);
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) online.delete(socket.username);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));
