const socket = io();

// Vraag de naam van de gebruiker
const username = prompt("Wat is je naam?") || "Anoniem";

// Verstuur bericht
document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('message');
    if(input.value){
        socket.emit('chat message', { user: username, msg: input.value });
        input.value = '';
    }
});

// Ontvang bericht
socket.on('chat message', (data) => {
    const li = document.createElement('li');
    li.textContent = `${data.user}: ${data.msg}`;
    document.getElementById('messages').appendChild(li);
});
