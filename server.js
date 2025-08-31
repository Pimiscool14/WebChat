const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Database setup
const db = new sqlite3.Database("chat.db");

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)");
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    msg TEXT,
    type TEXT,
    room TEXT,
    privateTo TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    friend TEXT,
    status TEXT
  )`);
});

// Online users
const online = new Map();

/* -------------------- Account systeem -------------------- */
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run(
    "INSERT INTO users (username,password) VALUES (?,?)",
    [username, password],
    (err) => {
      if (err) return res.status(400).json({ error: "Username already exists" });
      res.json({ success: true });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, row) => {
      if (row) res.json({ success: true });
      else res.status(400).json({ error: "Invalid credentials" });
    }
  );
});

/* -------------------- Socket.IO Chat systeem -------------------- */
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("set username", (uname) => {
    socket.username = uname;
    online.set(uname, socket.id);

    // Main chat geschiedenis
    db.all("SELECT * FROM messages WHERE room='main' ORDER BY id ASC", [], (err, rows) => {
      socket.emit("chat history", rows);
    });

    // Privégeschiedenis
    db.all("SELECT * FROM messages WHERE room='private' AND (user=? OR privateTo=?) ORDER BY id ASC", [uname, uname], (err, rows) => {
      socket.emit("load private chats", rows);
    });
  });

  /* -------------------- Algemene chat -------------------- */
  socket.on("chat message", (msg) => {
    db.run("INSERT INTO messages (user,msg,type,room) VALUES (?,?,?,?)", [socket.username, msg, "text", "main"], function() {
      io.emit("chat message", { id: this.lastID, user: socket.username, msg, type: "text" });
    });
  });

  /* -------------------- Privé chat -------------------- */
  socket.on("private message", (to, msg) => {
    db.run("INSERT INTO messages (user,msg,type,room,privateTo) VALUES (?,?,?,?,?)", [socket.username, msg, "text", "private", to], function() {
      const msgData = { id: this.lastID, user: socket.username, msg, type: "text", privateTo: to };
      const toSocket = online.get(to);
      if (toSocket) io.to(toSocket).emit("private message", msgData);
      socket.emit("private message", msgData);
    });
  });

  /* -------------------- Berichten verwijderen -------------------- */
  socket.on("delete message", (id) => {
    db.get("SELECT * FROM messages WHERE id=?", [id], (err, row) => {
      if (row && row.user === socket.username) {
        db.run("DELETE FROM messages WHERE id=?", [id]);
        if (row.room === "main") io.emit("delete message", id);
        else if (row.room === "private") {
          const toSocket = online.get(row.privateTo);
          if (toSocket) io.to(toSocket).emit("delete message", id);
          socket.emit("delete message", id);
        }
      }
    });
  });

  /* -------------------- Vrienden systeem -------------------- */
  socket.on("friend request", (to) => {
    db.run("INSERT INTO friends (user,friend,status) VALUES (?,?,?)", [socket.username, to, "pending"]);
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit("friend request", { from: socket.username });
  });

  socket.on("accept request", (from) => {
    db.run("UPDATE friends SET status='accepted' WHERE user=? AND friend=?", [from, socket.username]);
    db.run("INSERT INTO friends (user,friend,status) VALUES (?,?,?)", [socket.username, from, "accepted"]);
    const fromSocket = online.get(from);
    if (fromSocket) io.to(fromSocket).emit("request accepted", { from: socket.username });
  });

  socket.on("disconnect", () => {
    if (socket.username) online.delete(socket.username);
    console.log("Socket disconnected:", socket.id);
  });
});

/* -------------------- Server starten -------------------- */
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
