// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null; // null = main chat
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
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');
  const backToMainBtn = document.getElementById('back-to-main');

  const photoInput = document.getElementById('photo-input');
  const photoSendBtn = document.getElementById('photo-send-btn');
  const recordBtn = document.getElementById('record-btn');

  const friendsSection = document.getElementById('friends-section');
  const requestsContainer = document.getElementById('requests-container');
  const chatsList = document.getElementById('chats-list');
  const addFriendInput = document.getElementById('add-friend-username');
  const addFriendBtn = document.getElementById('add-friend-btn');

  const friendRequestPopup = document.getElementById('friend-request-popup');

  const fullscreenViewer = document.getElementById('fullscreen-viewer');
  const fullscreenImg = document.getElementById('fullscreen-img');

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

  // Register
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

  // Login
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
      } else alert(data.error);
    } catch (err) { alert('Fout: ' + err.message); }
  });

  // Render message (used for both main and private display)
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

    // delete only allowed for main chat and only by owner
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!data.privateTo && data.user === username) {
        if (confirm('Bericht verwijderen?')) socket.emit('delete message', data.id);
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // Socket handlers
  socket.on('chat history', (msgs) => {
    if (currentPrivate !== null) return;
    messagesList.innerHTML = '';
    (msgs || []).forEach(renderMessage);
  });
  socket.on('chat message', (msg) => { if (currentPrivate === null) renderMessage(msg); });
  socket.on('message deleted', id => { const el = document.getElementById(`msg-${id}`); if (el) el.remove(); });

  socket.on('load private chats', (threads) => {
    window.privateThreads = threads || {};
    if (currentPrivate) openPrivateChat(currentPrivate);
  });

  socket.on('private message', (msg) => {
    const key = duoKey(msg.user, msg.privateTo || username);
    if (!window.privateThreads[key]) window.privateThreads[key] = [];
    window.privateThreads[key].push(msg);
    if (currentPrivate && duoKey(username, currentPrivate) === key) renderMessage(msg);
  });

  // Send message
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!username) return alert('Log eerst in');
    const txt = (messageInput.value||'').trim();
    if (!txt) return;
    socket.emit('chat message', { user: username, msg: txt, type: 'text', privateTo: currentPrivate });
    messageInput.value = '';
  });

  // Photo upload
  photoInput.addEventListener('change', () => photoSendBtn.style.display = (photoInput.files && photoInput.files.length) ? 'inline-block' : 'none');
  photoSendBtn.addEventListener('click', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => socket.emit('chat message', { user: username, msg: reader.result, type: 'image', privateTo: currentPrivate });
    reader.readAsDataURL(file);
    photoInput.value = ''; photoSendBtn.style.display = 'none';
  });

  // fullscreen viewer
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('clickable-photo')) {
      fullscreenImg.src = e.target.src;
      fullscreenViewer.style.display = 'flex';
    }
  });
  fullscreenViewer.addEventListener('click', () => { fullscreenViewer.style.display = 'none'; fullscreenImg.src = ''; });

  // voice
  recordBtn.addEventListener('click', async () => {
    if (!username) return alert('Log eerst in om op te nemen');
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type:'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => socket.emit('chat message', { user: username, msg: reader.result, type:'audio', privateTo: currentPrivate });
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent = 'Stop opnemen';
      } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.textContent = '🎤 Opnemen';
      }
    } catch (err) { alert('Opname fout: ' + err.message); }
  });

  // Friends: load -> show requests on top, chats (friends) below
  function showRequestItem(from) {
    const div = document.createElement('div');
    div.className = 'request-item';
    const span = document.createElement('span'); span.textContent = `Verzoek van ${from}`;
    const actions = document.createElement('div');
    const acc = document.createElement('button'); acc.textContent = 'Accepteer';
    const rej = document.createElement('button'); rej.textContent = 'Weiger';
    acc.onclick = () => respondRequest(from, true, div);
    rej.onclick = () => respondRequest(from, false, div);
    actions.appendChild(acc); actions.appendChild(rej);
    div.appendChild(span); div.appendChild(actions);
    requestsContainer.appendChild(div);
  }

  function respondRequest(from, accept, el) {
    fetch('/respondFriendRequest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from, to: username, accept }) })
      .then(r => r.json()).then(() => { if (el) el.remove(); loadFriends(); }).catch(()=>{});
  }

  function loadFriends() {
    if (!username) return;
    fetch(`/getFriends/${username}`).then(r=>r.json()).then(data=>{
      requestsContainer.innerHTML = '';
      chatsList.innerHTML = '';
      (data.friendRequests || []).forEach(showRequestItem);
      (data.friends || []).forEach(f => {
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = f;
        const openBtn = document.createElement('button'); openBtn.textContent = 'Open'; openBtn.onclick = () => openPrivateChat(f);
        li.appendChild(name); li.appendChild(openBtn);
        chatsList.appendChild(li);
      });
    }).catch(()=>{});
  }

  socket.on('friend request', ({ from }) => {
    // show popup
    const popup = document.createElement('div'); popup.className = 'popup';
    const txt = document.createElement('span'); txt.textContent = `Verzoek van ${from}`;
    const actions = document.createElement('div'); const acc = document.createElement('button'); acc.textContent='Accepteer'; const rej = document.createElement('button'); rej.textContent='Weiger';
    acc.onclick = () => { respondRequest(from, true, popup); };
    rej.onclick = () => { respondRequest(from, false, popup); };
    actions.appendChild(acc); actions.appendChild(rej);
    popup.appendChild(txt); popup.appendChild(actions);
    friendRequestPopup.appendChild(popup);
    // also refresh list locally
    loadFriends();
  });

  socket.on('friends updated', () => loadFriends());

  addFriendBtn.addEventListener('click', () => {
    const to = (addFriendInput.value||'').trim();
    if (!to) return;
    if (!username) return alert('Log eerst in');
    if (to === username) return alert('Je kunt jezelf geen verzoek sturen');
    fetch('/sendFriendRequest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from: username, to }) })
      .then(r=>r.json()).then(d => { alert(d.message || d.error); addFriendInput.value=''; })
      .catch(e => alert('Fout: ' + e.message));
  });

  // open private chat with friend (only if friend)
  function openPrivateChat(friend) {
    currentPrivate = friend;
    messagesList.innerHTML = '';
    backToMainBtn.style.display = 'inline-block';
    const key = duoKey(username, friend);
    const msgs = window.privateThreads[key] || [];
    msgs.forEach(renderMessageForPrivate);
  }

  function renderMessageForPrivate(data) {
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;
    const userSpan = document.createElement('span'); userSpan.textContent = data.user; userSpan.style.color = stringToColor(data.user); userSpan.style.fontWeight='bold'; userSpan.style.marginRight='6px';
    const msgSpan = document.createElement('span');
    if (data.type === 'image') msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}">`;
    else if (data.type === 'audio') msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML = formatMessage(data.msg);
    li.appendChild(userSpan); li.appendChild(msgSpan);
    messagesList.appendChild(li);
    li.scrollIntoView({ behavior:'smooth', block:'end' });
  }

  backToMainBtn.addEventListener('click', () => {
    currentPrivate = null;
    backToMainBtn.style.display = 'none';
    messagesList.innerHTML = '';
    // request main chat again by re-sending username (server will re-send chat history)
    if (username) socket.emit('set username', username);
  });

  // helper used by socket private message handler
  function renderMessage(data){ // same as renderMessageForPrivate but for main/private unified usage
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;
    const userSpan = document.createElement('span'); userSpan.textContent = data.user; userSpan.style.color = stringToColor(data.user); userSpan.style.fontWeight='bold'; userSpan.style.marginRight='6px';
    const msgSpan = document.createElement('span');
    if (data.type === 'image') msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}">`;
    else if (data.type === 'audio') msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML = formatMessage(data.msg);
    li.appendChild(userSpan); li.appendChild(msgSpan);
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!data.privateTo && data.user === username) {
        if (confirm('Bericht verwijderen?')) socket.emit('delete message', data.id);
      }
    });
    messagesList.appendChild(li);
    li.scrollIntoView({ behavior:'smooth', block:'end' });
  }

  // make sure renderMessageForPrivate and renderMessage behave the same visually
  // kept both for clarity: socket handlers call renderMessage for main, and private open uses renderMessageForPrivate

});
