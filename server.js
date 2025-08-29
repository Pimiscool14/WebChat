const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// accounts.json pad
const accountsFile = path.join(__dirname, 'accounts.json');
if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));

// --- REGISTER ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vul alles in' });

    const accounts = JSON.parse(fs.readFileSync(accountsFile));
    if (accounts.find(u => u.username === username)) return res.status(400).json({ error: 'Gebruikersnaam bestaat al' });

    const hashedPassword = await bcrypt.hash(password, 10);
    accounts.push({ username, password: hashedPassword });
    fs.writeFileSync(accountsFile, JSON.stringify(accounts));

    res.json({ message: 'Account aangemaakt!' });
});

// --- LOGIN ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vul alles in' });

    if (!fs.existsSync(accountsFile)) return res.status(400).json({ error: 'Geen gebruikers gevonden' });

    const accounts = JSON.parse(fs.readFileSync(accountsFile));
    const user = accounts.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Gebruiker niet gevonden' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Fout wachtwoord' });

    res.json({ message: 'Inloggen gelukt!' });
});

// --- SOCKET.IO CHAT ---
io.on('connection', (socket) => {
    console.log('Een gebruiker is verbonden');

    socket.on('chat message', (data) => {
        // Stuur naar iedereen
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('Een gebruiker is weg');
    });
});

// --- SERVER START ---
http.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});
