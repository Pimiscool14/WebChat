const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database("webchat.db");

// Maak tabellen als ze nog niet bestaan
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  receiver TEXT,
  message TEXT,
  type TEXT,
  timestamp TEXT
)`).run();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Registratie endpoint
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  try {
    db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, password);
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: "Gebruiker bestaat al" });
  }
});

// Login endpoint
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username=? AND password=?").get(username, password);
  if (user) res.json({ success: true });
  else res.json({ success: false, error: "Ongeldige login" });
});

// Alle berichten ophalen (algemeen en privé)
app.get("/messages/:user", (req, res) => {
  const { user } = req.params;
  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE receiver IS NULL OR receiver=? OR sender=?
    ORDER BY id ASC
  `).all(user, user);
  res.json(messages);
});

// Berichten opslaan via socket.io
io.on("connection", (socket) => {
  socket.on("sendMessage", ({ sender, receiver, message, type }) => {
    const timestamp = new Date().toISOString();
    db.prepare("INSERT INTO messages (sender, receiver, message, type, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(sender, receiver || null, message, type, timestamp);
    io.emit("receiveMessage", { sender, receiver, message, type, timestamp });
  });

  socket.on("deleteMessage", ({ id, sender }) => {
    const msg = db.prepare("SELECT * FROM messages WHERE id=?").get(id);
    if (msg && msg.sender === sender) {
      db.prepare("DELETE FROM messages WHERE id=?").run(id);
      io.emit("deleteMessage", { id });
    }
  });
});

server.listen(3000, () => console.log("Server draait op http://localhost:3000"));
