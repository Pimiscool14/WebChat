// ===== Socket.io connect =====
const socket = io();
let currentUser = null;
let currentChat = "general"; // standaard algemene chat
let localStream;
let peerConnection;

// ===== LOGIN / REGISTER =====
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");

loginBtn?.addEventListener("click", () => {
const user = document.getElementById("login-username").value;
const pass = document.getElementById("login-password").value;
socket.emit("login", { username: user, password: pass });
});

registerBtn?.addEventListener("click", () => {
const user = document.getElementById("register-username").value;
const pass = document.getElementById("register-password").value;
socket.emit("register", { username: user, password: pass });
});

socket.on("loginSuccess", (user) => {
currentUser = user;
document.getElementById("auth").style.display = "none";
document.getElementById("chat-container").style.display = "flex";
showNotification("Inloggen gelukt");
});

socket.on("loginError", (msg) => showNotification(msg));
socket.on("registerSuccess", () => showNotification("Gebruiker gemaakt"));
socket.on("registerError", (msg) => showNotification(msg));

// ===== CHAT FUNCTIES =====
const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");

sendBtn?.addEventListener("click", sendMessage);
input?.addEventListener("keypress", (e) => {
if (e.key === "Enter") sendMessage();
});

function sendMessage() {
const text = input.value.trim();
if (!text) return;
socket.emit("chatMessage", { chat: currentChat, text });
input.value = "";
}

socket.on("chatMessage", (msg) => {
const div = document.createElement("div");
div.classList.add("message");
div.innerHTML = `<span class="username" style="color:${msg.color}">${msg.user}</span>: ${msg.text}`;
messages.appendChild(div);
messages.scrollTop = messages.scrollHeight;
updateTabNotification();
});

// ===== BESTAND UPLOADEN =====
const fileInput = document.getElementById("file-input");
const sendFileBtn = document.getElementById("send-file-btn");

sendFileBtn?.addEventListener("click", () => {
if (!fileInput.files[0]) return;
const file = fileInput.files[0];
const reader = new FileReader();
reader.onload = () => {
socket.emit("fileUpload", {
chat: currentChat,
name: file.name,
type: file.type,
data: reader.result
});
};
reader.readAsArrayBuffer(file);
});

socket.on("fileMessage", (file) => {
const div = document.createElement("div");
div.classList.add("message");
if (file.type.startsWith("image/")) {
div.innerHTML = `<span class="username">${file.user}</span>: <img src="${file.url}" style="max-width:200px;cursor:pointer" onclick="window.open('${file.url}')">`;
} else if (file.type.startsWith("video/")) {
div.innerHTML = `<span class="username">${file.user}</span>: <video controls src="${file.url}" style="max-width:200px"></video>`;
} else if (file.type.startsWith("audio/")) {
div.innerHTML = `<span class="username">${file.user}</span>: <audio controls src="${file.url}"></audio>`;
} else {
div.innerHTML = `<span class="username">${file.user}</span>: <a href="${file.url}" download="${file.name}">${file.name}</a>`;
}
messages.appendChild(div);
});

// ===== SPRAAK BERICHT =====
const voiceBtn = document.getElementById("voice-btn");
let mediaRecorder;
let chunks = [];

voiceBtn?.addEventListener("mousedown", async () => {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
mediaRecorder = new MediaRecorder(stream);
mediaRecorder.start();
mediaRecorder.ondataavailable = e => chunks.push(e.data);
});

voiceBtn?.addEventListener("mouseup", () => {
mediaRecorder.stop();
mediaRecorder.onstop = () => {
const blob = new Blob(chunks, { type: "audio/webm" });
chunks = [];
const reader = new FileReader();
reader.onload = () => {
socket.emit("voiceMessage", { chat: currentChat, data: reader.result });
};
reader.readAsArrayBuffer(blob);
};
});

socket.on("voiceMessage", (msg) => {
const div = document.createElement("div");
div.classList.add("message");
div.innerHTML = `<span class="username">${msg.user}</span>: <audio controls src="${msg.url}"></audio>`;
messages.appendChild(div);
});

// ===== VRIENDEN / PRIVÉCHAT =====
function sendFriendRequest(username) {
socket.emit("friendRequest", username);
}
socket.on("friendRequest", (from) => {
showNotification(`${from} heeft je een vriendschapsverzoek gestuurd`);
// TODO: Accepteren/Weigeren knoppen
});

// ===== ADMIN FUNCTIES =====
document.getElementById("ban-btn")?.addEventListener("click", () => {
const user = document.getElementById("ban-username").value;
socket.emit("banUser", user);
});

document.getElementById("unban-btn")?.addEventListener("click", () => {
const user = document.getElementById("ban-username").value;
socket.emit("unbanUser", user);
});

socket.on("banned", () => {
alert("U bent gebanned!");
location.reload();
});

// ===== BELLEN (WebRTC) =====
const callContainer = document.getElementById("call-container");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

function startCall(friend) {
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
localStream = stream;
localVideo.srcObject = stream;

```
peerConnection = new RTCPeerConnection();
stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

peerConnection.ontrack = event => {
  remoteVideo.srcObject = event.streams[0];
};

peerConnection.createOffer().then(offer => {
  peerConnection.setLocalDescription(offer);
  socket.emit("callUser", { to: friend, offer });
});

callContainer.style.display = "flex";
```

});
}

socket.on("callUser", async ({ from, offer }) => {
if (confirm(`${from} belt jou. Opnemen?`)) {
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
localStream = stream;
localVideo.srcObject = stream;

```
  peerConnection = new RTCPeerConnection();
  stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer().then(answer => {
    peerConnection.setLocalDescription(answer);
    socket.emit("answerCall", { to: from, answer });
  });

  callContainer.style.display = "flex";
});
```

}
});

socket.on("answerCall", (answer) => {
peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// ===== NOTIFICATIES =====
function showNotification(msg) {
const container = document.getElementById("notifications");
const div = document.createElement("div");
div.classList.add("notification");
div.textContent = msg;
container.appendChild(div);
setTimeout(() => {
div.style.opacity = 0;
setTimeout(() => div.remove(), 500);
}, 2000);
}

// ===== TAB NOTIFICATIES =====
let unread = 0;
function updateTabNotification() {
if (document.hidden) {
unread++;
document.title = `(${unread}) WebChat`;
}
}
document.addEventListener("visibilitychange", () => {
if (!document.hidden) {
unread = 0;
document.title = "WebChat";
}
});
