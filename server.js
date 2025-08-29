const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bcrypt = require('bcryptjs');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

const accountsFile = './accounts.json';
if (!fs.existsSync(accountsFile)) fs.writeFileSync(accountsFile, JSON.stringify([]));

// Registreren
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const accounts = JSON.parse(fs.readFileSync(accountsFile));

    if (accounts.find(u => u.username === username)) {
        return res.status(400).send({ error: 'Gebruikersnaam bestaat al' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    accounts.push({ username, password: hashedPassword });
    fs.writeFileSync(accountsFile, JSON.stringify(accounts));

    res.send({ message: 'Account aangemaakt!' });
});

// Inloggen
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const accounts = JSON.parse(fs.readFileSync(accountsFile));
    const user = accounts.find(u => u.username === username);

    if (!user) return res.status(400).send({ error: 'Gebruiker niet gevonden' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).send({ error: 'Fout wachtwoord' });

    res.send({ message: 'Inloggen gelukt!' });
});

// Chat
io.on('connection', (socket) => {
    console.log('Een gebruiker is verbonden');

    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('Een gebruiker is weg');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});
