document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null;
  window.privateThreads = {};

  // DOM refs
  const loginContainer = document.getElementById('login-container');
  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const registerUsername = document.getElementById('register-username');
  const registerPassword = document.getElementById('register-password');

  const chatContainer = document.getElementById('chat-container');
  const chatSection = document.getElementById('chat-section');
  const threadHeader = document.getElementById('thread-header');
  const backToMainBtn = document.getElementById('back-to-main');
  const threadTitle = document.getElementById('thread-title');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');

  const photoInput = document.getElementById('photo-input');
  const photoSendBtn = document.getElementById('photo-send-btn');
  const recordBtn = document.getElementById('record-btn');

  const friendsSection = document.getElementById('friends-section');
  const friendsList = document.getElementById('friends-list');
  const addFriendInput = document.getElementById('add-friend-username');
  const addFriendBtn = document.getElementById('add-friend-btn');

  const requestsList = document.getElementById('requests-list');
  const friendRequestPopup = document.getElementById('friend-request-popup');

  const fullscreenViewer = document.getElementById('fullscreen-viewer');
  const fullscreenImg = document.getElementById('fullscreen-img');

  const toggleThemeBtn = document.getElementById('toggle-theme-btn');

  // UTILITY FUNCTIES
  function duoKey(a,b){ return [a,b].sort().join('_'); }
  function stringToColor(str){ let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h); return "#"+("000000"+Math.floor((Math.abs(Math.sin(h)*16777215))%16777215).toString(16)).slice(-6); }
  function formatMessage(text){
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      let embed = "";
      if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")) {
        let vid = url.includes("youtube.com") ? (new URL(url).searchParams.get('v')) : url.split('/').pop();
        if (vid) embed = `<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>`;
      } else if (url.includes("vimeo.com/")) {
        const vid = url.split('vimeo.com/')[1];
        if (vid) embed = `<br><iframe src="https://player.vimeo.com/video/${vid}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;
      } else if (url.includes('tiktok.com')) {
        embed = `<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;
      } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
        embed = `<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video</video>`;
      } else if (url.match(/\.(mp3|wav|ogg)$/i)) {
        embed = `<br><audio controls><source src="${url}">Je browser ondersteunt geen audio</audio>`;
      } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        embed = `<br><img class="clickable-photo" src="${url}" alt="afbeelding">`;
      }
      return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${embed}`;
    });
  }

  // REGISTER
  registerBtn.addEventListener('click', async () => {
    const user = (registerUsername.value||'').trim();
    const pass = (registerPassword.value||'').trim();
    if (!user || !pass) return alert('Vul gebruikersnaam en wachtwoord in');
    try {
      const res = await fetch('/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass }) });
      const data = await res.json();
      alert(data.message || data.error);
      if (data.message) { registerUsername.value=''; registerPassword.value=''; }
    } catch (err) { alert('Fout: ' + err.message); }
  });

  // LOGIN
  loginBtn.addEventListener('click', async () => {
    const user = (loginUsername.value||'').trim();
    const pass = (loginPassword.value||'').trim();
    if (!user || !pass) return alert('Vul gebruikersnaam en wachtwoord in');
    try {
      const res = await fetch('/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass }) });
      const data = await res.json();
      if (data.message) {
        username = user;
        loginContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        friendsSection.style.display = 'block';
        socket.emit('set username', username);
        loadFriends();
        loadTheme();
      } else alert(data.error);
    } catch (err) { alert('Fout: ' + err.message); }
  });

  // THEMA
  async function loadTheme() {
    if (!username) return;
    try {
      const res = await fetch(`/theme/${username}`);
      const data = await res.json();
      if (data.theme) document.body.classList.toggle('light', data.theme === 'light');
    } catch (err) {}
  }

  toggleThemeBtn.addEventListener('click', async () => {
    if (!username) return alert('Log eerst in');
    const isLight = document.body.classList.toggle('light');
    const newTheme = isLight ? 'light' : 'dark';
    try {
      await fetch('/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, theme: newTheme })
      });
    } catch (err) { console.error(err); }
  });

  // Message render
  function renderMessage(data){
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;

    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight = 'bold';
    userSpan.style.marginRight = '6px';

    const msgSpan = document.createElement('span');
    if (data.type === 'image') msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;
    else if (data.type === 'audio') msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML = formatMessage(data.msg);

    li.appendChild(userSpan);
    li.appendChild(msgSpan);

    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!data.privateTo && data.user === username) {
        if (confirm('Bericht verwijderen?')) socket.emit('delete message', data.id);
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({ behavior:'smooth', block:'end' });
  }

  // socket events (chat, private chat, friend requests) blijven exact hetzelfde zoals in je originele script.js
  /* ... al je socket.off/on handlers, foto/audio upload, fullscreen viewer, friends UI ... */

  // PRIVATE CHAT
  function openPrivateChat(friend) {
    currentPrivate = friend;
    messagesList.innerHTML = '';
    threadHeader.style.display = 'flex';
    threadTitle.textContent = `Privé met ${friend}`;
    const key = duoKey(username, friend);
    const msgs = window.privateThreads[key] || [];
    msgs.forEach(m => renderMessage(m));
  }

  backToMainBtn.addEventListener('click', () => {
    currentPrivate = null;
    threadHeader.style.display = 'none';
    messagesList.innerHTML = '';
    if (username) socket.emit('set username', username);
  });

  // Prevent leaving while recording
  window.addEventListener('beforeunload', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  });

});
