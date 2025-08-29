const socket = io();
let username = "";

// Link, video en afbeelding formattering
function formatMessage(text) {
    // URLs herkennen
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    return text.replace(urlRegex, (url) => {
        let embedCode = "";

        // 🎥 1. YouTube
        if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")) {
            let videoId = "";
            if (url.includes("youtube.com/watch?v=")) {
                const params = new URL(url).searchParams;
                videoId = params.get("v");
            } else if (url.includes("youtu.be/")) {
                videoId = url.split("youtu.be/")[1].split(/[?&]/)[0];
            }

            if (videoId) {
                embedCode = `
                    <br>
                    <iframe width="300" height="169"
                        src="https://www.youtube-nocookie.com/embed/${videoId}"
                        frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
                `;
            }
        }

        // 🎥 2. Vimeo
        else if (url.includes("vimeo.com/")) {
            const videoId = url.split("vimeo.com/")[1];
            embedCode = `
                <br>
                <iframe src="https://player.vimeo.com/video/${videoId}" width="300" height="169"
                    frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
            `;
        }

        // 🎥 3. Directe video-bestanden (mp4, webm, ogg)
        else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            embedCode = `
                <br>
                <video width="300" controls>
                    <source src="${url}">
                    Je browser ondersteunt geen video-tag.
                </video>
            `;
        }

        // 🎶 4. Directe audio-bestanden (mp3, wav, ogg)
        else if (url.match(/\.(mp3|wav|ogg)$/i)) {
            embedCode = `
                <br>
                <audio controls>
                    <source src="${url}">
                    Je browser ondersteunt geen audio-tag.
                </audio>
            `;
        }

        // 🖼️ 5. Afbeeldingen (jpg, png, gif, webp)
        else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            embedCode = `
                <br>
                <img src="${url}" alt="afbeelding" style="max-width:300px; border-radius:8px; margin-top:5px;">
            `;
        }

        // 🎵 6. TikTok
        else if (url.includes("tiktok.com/")) {
            embedCode = `
                <br>
                <blockquote class="tiktok-embed" cite="${url}" data-video-id="" style="max-width:300px;min-width:300px;">
                    <a href="${url}">Bekijk TikTok</a>
                </blockquote>
                <script async src="https://www.tiktok.com/embed.js"></script>
            `;
        }

        // 🔗 Standaard → gewoon klikbare link
        return `<a href="${url}" target="_blank" style="color:blue">${url}</a>${embedCode}`;
    });
}


// ---------- MODE TOGGLE ----------
const body = document.body;
const modeBtn = document.getElementById("mode-toggle");

// Kijk of er al een voorkeur is opgeslagen
if (localStorage.getItem("mode") === "light") {
    body.classList.add("light");
}

modeBtn.addEventListener("click", () => {
    body.classList.toggle("light");
    if (body.classList.contains("light")) {
        localStorage.setItem("mode", "light");
    } else {
        localStorage.setItem("mode", "dark");
    }
});

// ---------- HASH FUNCTIE voor kleurtjes ----------
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.floor((Math.abs(Math.sin(hash) * 16777215)) % 16777215);
    return "#" + ("000000" + color.toString(16)).slice(-6);
}

// ---------- REGISTREREN ----------
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

// ---------- INLOGGEN ----------
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
        modeBtn.style.display = "block"; // toon knop pas na login
    } else {
        alert(data.error);
    }
});

// ---------- CHAT VERSTUREN ----------
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

// ---------- BERICHTEN ONTVANGEN ----------
socket.on('chat message', (data) => {
    const li = document.createElement('li');

    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight = "bold";

    const msgSpan = document.createElement('span');
    msgSpan.innerHTML = formatMessage(data.msg); // gebruik helperfunctie

    li.appendChild(userSpan);
    li.appendChild(document.createTextNode(": "));
    li.appendChild(msgSpan);

    document.getElementById('messages').appendChild(li);
});
