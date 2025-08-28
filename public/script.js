const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const chatSection = document.getElementById('chat-section');
const messages = document.getElementById('messages');

let socket;
let username;

// Registreren
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const regUser = document.getElementById('reg-username').value;
    const regPass = document.getElementById('reg-password').value;

    const res = await fetch('/register', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username: regUser, password: regPass})
    });
    const data = await res.json();

    if(data.error) alert(data.error);
    else {
        alert(data.message);
        registerForm.reset();
    }
});

// Inloggen
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const logUser = document.getElementById('log-username').value;
    const logPass = document.getElementById('log-password').value;

    const res = await fetch('/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username: logUser, password: logPass})
    });
    const data = await res.json();

    if(data.error) alert(data.error);
    else {
        username = data.username;
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        chatSection.style.display = 'block';

        // Verbinden met chat
        socket = io();

        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('message');
            if(input.value){
                socket.emit('chat message', {user: username, msg: input.value});
                input.value = '';
            }
        });

        socket.on('chat message', (data) => {
            const li = document.createElement('li');
            li.textContent = `${data.user}: ${data.msg}`;
            messages.appendChild(li);
            messages.scrollTop = messages.scrollHeight; // scroll naar beneden
        });
    }
});
