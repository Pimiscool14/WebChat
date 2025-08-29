const socket = io();
let username = "";

// ---------- MODE TOGGLE ----------
const body = document.body;
const modeBtn = document.getElementById("mode-toggle");
if (localStorage.getItem("mode") === "light") body.classList.add("light");
modeBtn.addEventListener("click", () => {
    body.classList.toggle("light");
    localStorage.setItem("mode", body.classList.contains("light") ? "light" : "dark");
});

// ---------- HASH FUNCTIE voor kleurtjes ----------
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const color = Math.floor((Math.abs(Math.sin(hash) * 16777215)) % 16777215);
    return "#" + ("000000" + color.toString(16)).slice(-6);
}

// ---------- FORMAT MESSAGE ----------
function formatMessage(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
        let embedCode = "";
        if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")) {
            let videoId = url.includes("youtube.com") ? new URL(url).searchParams.get("v") : url.split("/").pop();
            embedCode = `<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        } else if (url.includes("vimeo.com/")) {
            const videoId = url.split("vimeo.com/")[1];
            embedCode = `<br><iframe src="https://player.vimeo.com/video/${videoId}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            embedCode = `<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video-tag.</video>`;
        } else if (url.match(/\.(mp3|wav|ogg)$/i)) {
            embedCode = `<br><audio controls><source src="${url}">Je browser ondersteunt geen audio-tag.</audio>`;
        } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            embedCode = `<br><img src="${url}" style="max-width:300px; border-radius:8px; margin-top:5px;">`;
        } else if (url.includes("tiktok.com/")) {
            embedCode = `<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;
        }
        return `<a href="${url}" target="_blank" style="color:blue">${url}</a>${embedCode}`;
    });
}

// ---------- REGISTREREN ----------
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/register', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            username: document.getElementById('reg-username').value,
            password: document.getElementById('reg-password').value
        })
    });
    const data = await res.json();
    alert(data.message || data.error);
});

// ---------- INLOGGEN ----------
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const logUser = document.getElementById('log-username').value;
    const logPass = document.getElementById('log-password').value;
    const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:logUser,password:logPass})
    });
    const data = await res.json();
    if(data.message){
        alert(data.message);
        username = logUser;
        document.getElementById('login-form').style.display='none';
        document.getElementById('register-form').style.display='none';
        document.getElementById('chat-section').style.display='block';
        modeBtn.style.display="block";
    } else alert(data.error);
});

// ---------- CHAT VERSTUREN ----------
document.getElementById('chat-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = document.getElementById('message');
    if(input.value.trim() !== "" && username){
        socket.emit('chat message',{user:username,msg:input.value,type:"text"});
        input.value='';
    }
});

// Enter = verzenden
document.getElementById('message').addEventListener('keypress',(e)=>{
    if(e.key==='Enter'){ e.preventDefault(); document.getElementById('chat-form').dispatchEvent(new Event('submit')); }
});

// ---------- FOTO UPLOAD ----------
document.getElementById("photo-input").addEventListener("change",(e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=> socket.emit("chat message",{user:username,msg:reader.result,type:"image"});
    reader.readAsDataURL(file);
});

// ---------- SPRAAK OPNAME ----------
let mediaRecorder; let audioChunks=[];
const recordBtn = document.getElementById("record-btn");
recordBtn.addEventListener("click",async ()=>{
    if(!mediaRecorder || mediaRecorder.state==="inactive"){
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e=>audioChunks.push(e.data);
        mediaRecorder.onstop = ()=>{
            const audioBlob = new Blob(audioChunks,{type:"audio/webm"});
            audioChunks=[];
            const reader = new FileReader();
            reader.onload = ()=>socket.emit("chat message",{user:username,msg:reader.result,type:"audio"});
            reader.readAsDataURL(audioBlob);
        };
        mediaRecorder.start(); recordBtn.textContent="Stop opnemen";
    } else if(mediaRecorder.state==="recording"){ mediaRecorder.stop(); recordBtn.textContent="Record"; }
});

// ---------- BERICHTEN ONTVANGEN ----------
socket.on('chat message',(data)=>{
    const li=document.createElement("li");
    const userSpan=document.createElement("span");
    userSpan.textContent=data.user; userSpan.style.color=stringToColor(data.user); userSpan.style.fontWeight="bold";
    const msgSpan=document.createElement("span");
    if(data.type==="audio") msgSpan.innerHTML=`<audio controls src="${data.msg}"></audio>`;
    else if(data.type==="image") msgSpan.innerHTML=`<img src="${data.msg}" style="max-width:300px; border-radius:8px; margin-top:5px;">`;
    else msgSpan.innerHTML=formatMessage(data.msg);
    li.appendChild(userSpan);
    li.appendChild(document.createTextNode(": "));
    li.appendChild(msgSpan);
    document.getElementById("messages").appendChild(li);
    li.scrollIntoView();
});
