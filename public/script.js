// ------------------- VARIABLES -------------------
let currentUser = localStorage.getItem("currentUser") || "";
let generalMessages = JSON.parse(localStorage.getItem("generalMessages") || "[]");
let privateMessages = JSON.parse(localStorage.getItem("privateMessages") || "{}");
let currentPrivate = null;

// DOM ELEMENTS
const messagesDiv = document.getElementById("messages");
const privateMessagesDiv = document.getElementById("privateMessages");
const privateChatDiv = document.getElementById("privateChat");

// ------------------- RENDERING -------------------
function renderMessages() {
    messagesDiv.innerHTML = "";
    generalMessages.forEach(msg => {
        const div = document.createElement("div");
        div.className = "message";
        div.innerHTML = formatMessage(msg);
        messagesDiv.appendChild(div);
    });
}

function renderPrivateMessages() {
    privateMessagesDiv.innerHTML = "";
    if (!currentPrivate) return;
    privateMessages[currentPrivate].forEach(msg => {
        const div = document.createElement("div");
        div.className = "message";
        div.innerHTML = formatMessage(msg);
        privateMessagesDiv.appendChild(div);
    });
}

function formatMessage(msg) {
    // Tekst
    if (msg.type === "text") return `<b>${msg.user}:</b> ${msg.content}`;
    // Afbeelding
    if (msg.type === "image") return `<b>${msg.user}:</b><br><img src="${msg.content}" style="max-width:200px;">`;
    // Audio
    if (msg.type === "audio") return `<b>${msg.user}:</b><br><audio controls src="${msg.content}"></audio>`;
    // Video/MP4
    if (msg.type === "video") return `<b>${msg.user}:</b><br><video controls src="${msg.content}" style="max-width:300px;"></video>`;
    // YouTube/Vimeo/TikTok
    if (msg.type === "embed") return `<b>${msg.user}:</b><br>${msg.content}`;
}

// ------------------- SEND MESSAGE -------------------
function sendMessage(content, type="text", to=null) {
    const msg = { user: currentUser, type, content };
    if (!to) {
        generalMessages.push(msg);
        localStorage.setItem("generalMessages", JSON.stringify(generalMessages));
        renderMessages();
    } else {
        if (!privateMessages[to]) privateMessages[to] = [];
        privateMessages[to].push(msg);
        localStorage.setItem("privateMessages", JSON.stringify(privateMessages));
        renderPrivateMessages();
    }
}

// ------------------- DELETE MENU -------------------
function setupDeleteMenu() {
    let overlay = document.createElement("div");
    overlay.id = "deleteOverlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.display = "none";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.zIndex = "1000";

    let btn = document.createElement("button");
    btn.textContent = "Verwijderen";
    btn.style.padding = "20px";
    btn.style.fontSize = "18px";
    btn.style.cursor = "pointer";
    overlay.appendChild(btn);
    document.body.appendChild(overlay);

    let targetMsg = null;

    // Algemene chat
    messagesDiv.addEventListener("contextmenu", e => {
        e.preventDefault();
        const msgDiv = e.target.closest(".message");
        if (!msgDiv) return;
        const index = Array.from(messagesDiv.children).indexOf(msgDiv);
        const msgData = generalMessages[index];
        if (msgData.user !== currentUser) return;
        targetMsg = index;
        overlay.style.display = "flex";
    });

    // Privé chat
    privateMessagesDiv.addEventListener("contextmenu", e => {
        e.preventDefault();
        const msgDiv = e.target.closest(".message");
        if (!msgDiv || !currentPrivate) return;
        const index = Array.from(privateMessagesDiv.children).indexOf(msgDiv);
        const msgData = privateMessages[currentPrivate][index];
        if (msgData.user !== currentUser) return;
        targetMsg = index;
        overlay.style.display = "flex";
    });

    btn.addEventListener("click", () => {
        if (targetMsg === null) return;
        overlay.style.display = "none";

        if (privateChatDiv.classList.contains("hidden")) {
            generalMessages.splice(targetMsg, 1);
            localStorage.setItem("generalMessages", JSON.stringify(generalMessages));
            renderMessages();
        } else {
            privateMessages[currentPrivate].splice(targetMsg, 1);
            localStorage.setItem("privateMessages", JSON.stringify(privateMessages));
            renderPrivateMessages();
        }
        targetMsg = null;
    });

    overlay.addEventListener("click", e => {
        if (e.target === overlay) {
            overlay.style.display = "none";
            targetMsg = null;
        }
    });
}

setupDeleteMenu();

// ------------------- INIT -------------------
renderMessages();
renderPrivateMessages();
