const socket = io();

// Gebruiker info
let currentUser = null;

// DOM elementen
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');
const friendsListDiv = document.getElementById('friendsList');
const requestsListDiv = document.getElementById('requestsList');
const fileInput = document.getElementById('fileInput');

// Login & register
loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const username = loginForm.username.value;
    const password = loginForm.password.value;
    fetch('/login', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password}) })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            currentUser = username;
            initChat();
        } else alert(data.error);
    });
});

registerForm.addEventListener('submit', e => {
    e.preventDefault();
    const username = registerForm.username.value;
    const password = registerForm.password.value;
    fetch('/register', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password}) })
    .then(res => res.json())
    .then(data => {
        if(data.success) alert('Account aangemaakt!'); 
        else alert(data.error);
    });
});

// Init chat
function initChat() {
    document.getElementById('loginSection').style.display = 'none';
    chatContainer.style.display = 'block';
    socket.emit('load-messages', currentUser);
    socket.emit('load-friends', currentUser);
    socket.emit('load-requests', currentUser);
}

// Verstuur bericht
sendBtn.addEventListener('click', () => {
    const content = messageInput.value;
    if (!content) return;

    const message = { sender: currentUser, receiver: null, type: 'text', content };
    socket.emit('send-message', message);
    messageInput.value = '';
});

// Upload bestand
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if(data.success){
                const ext = file.name.split('.').pop().toLowerCase();
                let type = 'file';
                if(['jpg','png','gif','jpeg'].includes(ext)) type = 'image';
                else if(['mp3','wav'].includes(ext)) type = 'audio';
                else if(['mp4','webm'].includes(ext)) type = 'video';

                const message = { sender: currentUser, receiver: null, type, content: data.path };
                socket.emit('send-message', message);
            }
        });
});

// Ontvang bericht
socket.on('receive-message', msg => displayMessage(msg));

// Verwijder bericht
socket.on('delete-message', id => {
    const msgDiv = document.getElementById(`msg-${id}`);
    if(msgDiv) msgDiv.remove();
});

// Laden van oude berichten
socket.on('load-messages', messages => messages.forEach(displayMessage));

// Laden vrienden en verzoeken
socket.on('load-friends', friends => {
    friendsListDiv.innerHTML = '';
    friends.forEach(f => {
        if(f.status === 'accepted'){
            const div = document.createElement('div');
            div.textContent = f.friend;
            friendsListDiv.appendChild(div);
        }
    });
});

socket.on('load-requests', requests => {
    requestsListDiv.innerHTML = '';
    requests.forEach(r => {
        const div = document.createElement('div');
        div.textContent = r.user + ' wil vriend worden';
        const acceptBtn = document.createElement('button');
        acceptBtn.textContent = 'Accepteer';
        acceptBtn.onclick = () => {
            fetch('/friend-accept', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:r.user, friend:currentUser}) })
            .then(res=>res.json()).then(()=>socket.emit('load-friends', currentUser));
        };
        div.appendChild(acceptBtn);
        requestsListDiv.appendChild(div);
    });
});

// Functie om bericht te tonen
function displayMessage(msg){
    const div = document.createElement('div');
    div.id = `msg-${msg.id}`;
    div.className = 'message';

    // Rechtsklik om verwijderen
    div.oncontextmenu = e => {
        e.preventDefault();
        if(msg.sender === currentUser){
            if(confirm('Wil je dit bericht verwijderen?')) socket.emit('delete-message', { id: msg.id, username: currentUser });
        }
    };

    let content;
    switch(msg.type){
        case 'text': content = msg.content; break;
        case 'image': content = `<img src="${msg.content}" alt="image" />`; break;
        case 'audio': content = `<audio controls src="${msg.content}"></audio>`; break;
        case 'video': content = `<video controls src="${msg.content}"></video>`; break;
        default: content = `<a href="${msg.content}" target="_blank">Bestand</a>`;
    }
    div.innerHTML = `<strong>${msg.sender}:</strong> ${content}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
