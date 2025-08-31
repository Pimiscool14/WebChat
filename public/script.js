// public/script.js
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
      } else alert(data.error);
    } catch (err) { alert('Fout: ' + err.message); }
  });

  // RENDER MESSAGE
  function addMessageToList(data){
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

  // SOCKET handlers
  socket.on('chat history', (msgs) => {
    if (currentPrivate !== null) return;
    messagesList.innerHTML = '';
    (msgs||[]).forEach(addMessageToList);
  });

  socket.on('chat message', (msg) => { if (currentPrivate === null) addMessageToList(msg); });
  socket.on('message deleted', (id) => { const el = document.getElementById(`msg-${id}`); if (el) el.remove(); });

  socket.on('load private chats', (threads) => { window.privateThreads = threads || {}; if (currentPrivate) openPrivateChat(currentPrivate); });

  socket.on('private message', (msg) => {
    const key = duoKey(msg.user, msg.privateTo || username);
    if (!window.privateThreads[key]) window.privateThreads[key] = [];
    window.privateThreads[key].push(msg);
    if (currentPrivate && duoKey(username, currentPrivate) === key) addMessageToList(msg);
  });

  // SEND message
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!username) return alert('Log eerst in');
    const txt = (messageInput.value||'').trim();
    if (!txt) return;
    socket.emit('chat message', { user: username, msg: txt, type:'text', privateTo: currentPrivate });
    messageInput.value = '';
  });

  // photo uploader
  photoInput.addEventListener('change', () => {
    photoSendBtn.style.display = (photoInput.files && photoInput.files.length) ? 'inline-block' : 'none';
  });
  photoSendBtn.addEventListener('click', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => socket.emit('chat message', { user: username, msg: reader.result, type:'image', privateTo: currentPrivate });
    reader.readAsDataURL(file);
    photoInput.value = '';
    photoSendBtn.style.display = 'none';
  });

  // fullscreen viewer
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('clickable-photo')) {
      fullscreenImg.src = e.target.src;
      fullscreenViewer.style.display = 'flex';
    }
  });
  fullscreenViewer.addEventListener('click', () => {
    fullscreenViewer.style.display = 'none';
    fullscreenImg.src = '';
  });

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

  // FRIENDS
  function showFriendRequestPopup(from) {
    const wrap = document.createElement('div');
    wrap.className = 'popup';
    const txt = document.createElement('span'); txt.textContent = `Verzoek van ${from}`;
    const actions = document.createElement('div'); actions.className = 'actions';
    const acc = document.createElement('button'); acc.textContent = 'Accepteer';
    const rej = document.createElement('button'); rej.textContent = 'Weiger';
    acc.onclick = () => respondFriendRequest(from, true, wrap);
    rej.onclick = () => respondFriendRequest(from, false, wrap);
    actions.appendChild(acc); actions.appendChild(rej);
    wrap.appendChild(txt); wrap.appendChild(actions);
    friendRequestPopup.appendChild(wrap);
  }

  function respondFriendRequest(from, accept, element) {
    fetch('/respondFriendRequest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from, to: username, accept }) })
      .then(r => r.json()).then(()=>{ if (element) element.remove(); loadFriends(); })
      .catch(()=>{});
  }

  function loadFriends(){
    if (!username) return;
    fetch(`/getFriends/${username}`).then(r=>r.json()).then(data=>{
      friendsList.innerHTML = '';
      friendRequestPopup.innerHTML = '';
      (data.friends || []).forEach(f => {
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = f;
        const chatBtn = document.createElement('button'); chatBtn.textContent = '💬'; chatBtn.title = `Privé met ${f}`; chatBtn.onclick = () => openPrivateChat(f);
        li.appendChild(name); li.appendChild(chatBtn); friendsList.appendChild(li);
      });
      (data.friendRequests || []).forEach(reqFrom => showFriendRequestPopup(reqFrom));
    }).catch(()=>{});
  }

  // server real-time notifications
  socket.on('friend request', ({ from }) => { showFriendRequestPopup(from); });
  socket.on('friends updated', () => { loadFriends(); });

  addFriendBtn.addEventListener('click', () => {
    const to = (addFriendInput.value||'').trim();
    if (!to) return;
    if (!username) return alert('Log eerst in');
    if (to === username) return alert('Je kunt jezelf geen verzoek sturen');
    fetch('/sendFriendRequest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from: username, to }) })
      .then(r=>r.json()).then(d => { alert(d.message || d.error); addFriendInput.value = ''; });
  });

  function openPrivateChat(friend){
    currentPrivate = friend;
    messagesList.innerHTML = '';
    const key = duoKey(username, friend);
    const msgs = window.privateThreads[key] || [];
    msgs.forEach(addMessageToList);
  }

  // small helper to add message when opening private thread
  function addMessageToList(data){
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;
    const userSpan = document.createElement('span'); userSpan.textContent = data.user; userSpan.style.color = stringToColor(data.user); userSpan.style.fontWeight='bold'; userSpan.style.marginRight='6px';
    const msgSpan = document.createElement('span');
    if (data.type === 'image') msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}">`;
    else if (data.type === 'audio') msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML = formatMessage(data.msg);
    li.appendChild(userSpan); li.appendChild(msgSpan);
    // delete only allowed for main chat (privateTo undefined) and only by owner
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!data.privateTo && data.user === username) {
        if (confirm('Bericht verwijderen?')) socket.emit('delete message', data.id);
      }
    });
    messagesList.appendChild(li);
    li.scrollIntoView({ behavior:'smooth', block:'end' });
  }

  // small shim: ensure addMessageToList function above and this one are same (we used one in socket handlers)
  // Replace the earlier binding with this final addMessageToList reference:
  window.addMessageToList = addMessageToList;

});
