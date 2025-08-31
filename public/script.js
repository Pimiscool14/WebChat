const socket = io();
let currentChat = "main"; 
let username = null;

function showNotification(text) {
  const notif = document.createElement("div");
  notif.className = "notification fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2";
  notif.innerText = text;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function renderMessage(container, data) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.dataset.id = data.id;
  msg.innerText = `${data.user}: ${data.msg}`;

  if (data.user === username) {
    const delBtn = document.createElement("button");
    delBtn.innerText = "×";
    delBtn.style.position = "absolute";
    delBtn.style.right = "5px";
    delBtn.style.top = "2px";
    delBtn.onclick = () => socket.emit("delete message", data.id);
    msg.appendChild(delBtn);
  }

  container.appendChild(msg);
}

document.getElementById("registerBtn").onclick = async () => {
  const uname = document.getElementById("username").value;
  const pwd = document.getElementById("password").value;

  const res = await fetch("/register", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ username:uname, password:pwd })
  });
  if (res.ok) showNotification("Registratie gelukt!");
  else showNotification("Gebruiker bestaat al!");
};

document.getElementById("loginBtn").onclick = async () => {
  const uname = document.getElementById("username").value;
  const pwd = document.getElementById("password").value;

  const res = await fetch("/login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ username:uname, password:pwd })
  });

  if (res.ok) {
    username = uname;
    localStorage.setItem("username", uname);
    socket.emit("set username", uname);
    document.getElementById("loginForm").style.display="none";
    document.getElementById("chatContainer").style.display="flex";
    showNotification("Inloggen gelukt!");
  } else showNotification("Ongeldige gegevens!");
};

// Auto login
window.addEventListener("load", () => {
  const savedUser = localStorage.getItem("username");
  if (savedUser) {
    username = savedUser;
    socket.emit("set username", savedUser);
    document.getElementById("loginForm").style.display="none";
    document.getElementById("chatContainer").style.display="flex";
    showNotification("Welkom terug, "+savedUser);
  }
