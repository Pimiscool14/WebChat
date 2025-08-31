const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const Database = require('better-sqlite3');

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new Database('chat.db');

// Tabellen maken
db.prepare(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS friends (
    user TEXT,
    friend TEXT,
    status TEXT DEFAULT 'pending', -- pending, accepted
    PRIMARY KEY(user, friend)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    type TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Multer setup voor uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    res.json({ success: true, path: `/uploads/${req.file.filename}` });
});

// Accounts
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    try {
        db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, password);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: 'Gebruiker bestaat al' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
    if (user) res.json({ success: true });
    else res.json({ success: false, error: 'Gebruiker niet gevonden' });
});

// Vrienden/verzoeken
app.post('/friend-request', (req, res) => {
    const { user, friend } = req.body;
    try {
        db.prepare('INSERT INTO friends (user, friend) VALUES (?, ?)').run(user, friend);
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
});

app.post('/friend-accept', (req, res) => {
    const { user, friend } = req.body;
    db.prepare('UPDATE friends SET status = "accepted" WHERE user = ? AND friend = ?').run(friend, user);
    db.prepare('INSERT OR IGNORE INTO friends (user, friend, status) VALUES (?, ?, "accepted")').run(user, friend);
    res.json({ success: true });
});

// Socket.io
io.on('connection', socket => {
    // Verstuur bericht
    socket.on('send-message', msg => {
        const { sender, receiver, type, content } = msg;
        const stmt = db.prepare('INSERT INTO messages (sender, receiver, type, content) VALUES (?, ?, ?, ?)');
        const info = stmt.run(sender, receiver, type, content);
        io.emit('receive-message', { id: info.lastInsertRowid, ...msg });
    });

    // Verwijder bericht
    socket.on('delete-message', ({ id, username }) => {
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (msg && msg.sender === username) {
            db.prepare('DELETE FROM messages WHERE id = ?').run(id);
            io.emit('delete-message', id);
        }
    });

    // Vraag berichten op (voor bij refresh)
    socket.on('load-messages', username => {
        const messages = db.prepare('SELECT * FROM messages WHERE receiver = ? OR receiver IS NULL OR sender = ?').all(username, username);
        socket.emit('load-messages', messages);
    });

    // Vriendenlijst ophalen
    socket.on('load-friends', username => {
        const friends = db.prepare('SELECT * FROM friends WHERE user = ?').all(username);
        socket.emit('load-friends', friends);
    });

    // Verzoeken ophalen
    socket.on('load-requests', username => {
        const requests = db.prepare('SELECT * FROM friends WHERE friend = ? AND status = "pending"').all(username);
        socket.emit('load-requests', requests);
    });
});

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
