const socket = io();
let username = "";

// Registreren
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const regUser = document.getElementById('reg-username').value;
    const regPass = document.getElementById('reg-password').value;

    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUser, password: regPass })
    });

    const data = await res.json();
    alert(data.message || data.error);
});

// Inloggen
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const logUser = document.getElementById('log-username').value;
    const logPass = document.getElementById('log-password').value;

    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: logUser, password: logPass })
    });

    const data = await res.json();
    if (data.message) {
        alert(data.message);
        username = logUser;

        // chat tonen
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('chat-section').style.display = 'block';
    } else {
        alert(data.error);
    }
});

// Chat versturen
document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('message');
    if (input.value.trim() !== "") {
        socket.emit('chat message', { user: username, msg: input.value });
        input.value = '';
    }
});

// Enter = bericht versturen
document.getElementById('message').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('chat-form').dispatchEvent(new Event('submit'));
    }
});

// Berichten ontvangen
socket.on('chat message', (data) => {
    const li = document.createElement('li');
    li.textContent = `${data.user}: ${data.msg}`;
    document.getElementById('messages').appendChild(li);
});
