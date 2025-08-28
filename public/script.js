const socket = io();

// Laat login scherm
function showLogin(){
    document.getElementById("loginDiv").style.display = "block";
    document.getElementById("registerDiv").style.display = "none";
}

// Laat registratie scherm
function showRegister(){
    document.getElementById("loginDiv").style.display = "none";
    document.getElementById("registerDiv").style.display = "block";
}

// Registreren
async function register(){
    const username = document.getElementById("regUsername").value;
    const password = document.getElementById("regPassword").value;

    const res = await fetch('/register', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username,password})
    });

    const data = await res.json();
    if(res.ok){
        alert(data.message);
        showLogin();
    } else {
        alert(data.error);
    }
}

// Inloggen
async function login(){
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username,password})
    });

    const data = await res.json();
    if(res.ok){
        alert(data.message);
        document.getElementById("loginDiv").style.display = "none";
        document.getElementById("chatDiv").style.display = "block";
    } else {
        alert(data.error);
    }
}

// Chat functies
function sendMessage(){
    const msgInput = document.getElementById("message");
    const chatBox = document.getElementById("chatBox");

    if(msgInput.value !== ""){
        socket.emit('chat message', msgInput.value);
        msgInput.value = "";
    }
}

socket.on('chat message', msg => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML += `<p>${msg}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});
