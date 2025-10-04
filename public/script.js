// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = localStorage.getItem('username') || "";
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
  const logoutBtn = document.getElementById('logout-btn');

  const chatContainer = document.getElementById('chat-container');
  const chatSection = document.getElementById('chat-section');
  const threadHeader = document.getElementById('thread-header');
  const backToMainBtn = document.getElementById('back-to-main');
  const threadTitle = document.getElementById('thread-title');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');

  const fileInput = document.getElementById('file-input');
  const fileSendBtn = document.getElementById('file-send-btn');
  const recordBtn = document.getElementById('record-btn');

  const friendsSection = document.getElementById('friends-section');
  const friendsList = document.getElementById('friends-list');
  const addFriendInput = document.getElementById('add-friend-username');
  const addFriendBtn = document.getElementById('add-friend-btn');
  const requestsList = document.getElementById('requests-list');

  const fullscreenViewer = document.getElementById('fullscreen-viewer');
  const fullscreenImg = document.getElementById('fullscreen-img');

  const notification = document.getElementById('notification');

  // helpers
  function duoKey(a,b){ return [a,b].sort().join('_'); }
  function stringToColor(str){ let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h); return "#"+("000000"+Math.floor((Math.abs(Math.sin(h)*16777215))%16777215).toString(16)).slice(-6); }
  function showNotification(msg, type='info', duration=2000){
    notification.textContent = msg;
    notification.style.background = type === 'error' ? '#d73a49' : '#2ea44f';
    notification.classList.add('show');
    setTimeout(()=>notification.classList.remove('show'), duration);
  }

  function formatMessage(text){
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex,(url)=>{
      let embed="";
      if(url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")){
        const vid = url.includes("youtube.com") ? (new URL(url).searchParams.get('v')) : url.split('/').pop();
        if(vid) embed=`<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>`;
      } else if(url.includes("vimeo.com/")) {
        const vid = url.split('vimeo.com/')[1];
        if(vid) embed=`<br><iframe src="https://player.vimeo.com/video/${vid}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;
      } else if(url.includes('tiktok.com')){
        embed=`<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;
      } else if(url.match(/\.(mp4|webm|ogg)$/i)){
        embed=`<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video</video>`;
      } else if(url.match(/\.(mp3|wav|ogg)$/i)){
        embed=`<br><audio controls><source src="${url}">Je browser ondersteunt geen audio</audio>`;
      } else if(url.match(/\.(jpg|jpeg|png|gif|webp)$/i)){
        embed=`<br><img class="clickable-photo" src="${url}" alt="afbeelding">`;
      }
      return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${embed}`;
    });
  }

  // message render
  function renderMessage(data){
    if(!data || !data.id) return;
    // avoid duplicate rendering if already in DOM
    if(document.getElementById(`msg-${data.id}`)) return;

    const li = document.createElement('li');
    li.id = `msg-${data.id}`;

    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight = 'bold';
    userSpan.style.marginRight = '6px';

    const msgSpan = document.createElement('span');
    if (data.type === 'image') {
  msgSpan.innerHTML = `<img class="clickable-media" data-type="image" src="${data.msg}" alt="${data.fileName || 'afbeelding'}">`;
} else if (data.type === 'video') {
  msgSpan.innerHTML = `<video class="clickable-media" data-type="video" src="${data.msg}" style="max-width:200px;cursor:pointer;" muted></video>`;
} else if (data.type === 'audio') {
  msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
} else if (data.type === 'file') {
  msgSpan.innerHTML = `<a href="${data.msg}" download="${data.fileName || 'bestand'}">📎 Download ${data.fileName || 'bestand'}</a>`;
} else {
  msgSpan.innerHTML = formatMessage(data.msg);
}

    li.appendChild(userSpan);
    li.appendChild(msgSpan);

    // deletion (context menu)
    li.addEventListener('contextmenu', (e)=> {
      e.preventDefault();
      if (data.user !== username) return;
      if (!confirm('Bericht verwijderen?')) return;
      if (data.privateTo) {
        // private message
        socket.emit('delete private message', { id: data.id, to: data.privateTo });
      } else {
        // main message
        socket.emit('delete message', data.id);
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // ------------------ Auth / auto-login ------------------
  async function tryAutoLogin() {
    if (!username) return;
    // we do not call /login with password; we trust localStorage for auto restore UX.
    loginContainer.style.display = 'none';
    logoutBtn.style.display = 'block';
    chatContainer.style.display = 'flex';
    friendsSection.style.display = 'block';
    socket.emit('set username', username);
    showNotification(`Welkom terug, ${username}`);
    loadFriends();
  }

  registerBtn.addEventListener('click', async () => {
    const user = (registerUsername.value||'').trim();
    const pass = (registerPassword.value||'').trim();
    if (!user || !pass) return showNotification('Vul gebruikersnaam en wachtwoord in', 'error');
    try {
      const res = await fetch('/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass })});
      const data = await res.json();
      showNotification(data.message || data.error, data.message ? 'info' : 'error');
      if (data.message) { registerUsername.value=''; registerPassword.value=''; }
    } catch (err) { showNotification('Fout: ' + err.message, 'error'); }
  });

  loginBtn.addEventListener('click', async () => {
    const user = (loginUsername.value||'').trim();
    const pass = (loginPassword.value||'').trim();
    if (!user || !pass) return showNotification('Vul gebruikersnaam en wachtwoord in', 'error');
    try {
      const res = await fetch('/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass })});
      const data = await res.json();
      if (data.message) {
        username = user;
        localStorage.setItem('username', username);
        loginContainer.style.display = 'none';
        logoutBtn.style.display = 'block';
        chatContainer.style.display = 'flex';
        friendsSection.style.display = 'block';
        socket.emit('set username', username);
        showNotification('Inloggen gelukt');
        loadFriends();
      } else {
        showNotification(data.error || 'Login mislukt', 'error');
      }
    } catch (err) { showNotification('Fout: ' + err.message, 'error'); }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('username');
    username = '';
    loginContainer.style.display = 'block';
    logoutBtn.style.display = 'none';
    chatContainer.style.display = 'none';
    friendsSection.style.display = 'none';
    messagesList.innerHTML = '';
    currentPrivate = null;
    showNotification('Uitgelogd');
  });

  // auto login if saved
  if (username) tryAutoLogin();

  // ------------------ Socket listeners ------------------
  socket.off('chat history'); socket.on('chat history', (msgs) => {
    if (currentPrivate) return;
    messagesList.innerHTML = '';
    (msgs || []).forEach(renderMessage);
  });

  socket.off('chat message'); socket.on('chat message', (msg) => {
    // ensure this is main chat (server sends 'chat message' only for main chat)
    if (msg.privateTo) return; // safety
    renderMessage(msg);
  });

  socket.off('message deleted'); socket.on('message deleted', (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
  });

  socket.off('load private chats'); socket.on('load private chats', (threads) => {
    window.privateThreads = threads || {};
    // if currently in a private chat, re-render it
    if (currentPrivate) openPrivateChat(currentPrivate);
  });

  socket.off('private message'); socket.on('private message', (msg) => {
    // msg.privateTo is receiver OR undefined — server sets privateTo on send
    const key = duoKey(msg.user, msg.privateTo || username);
    if (!window.privateThreads[key]) window.privateThreads[key] = [];
    // prevent duplicates by id
    if (!window.privateThreads[key].some(m => m.id === msg.id)) {
      window.privateThreads[key].push(msg);
    }
    // render if this thread open
    if (currentPrivate && duoKey(username, currentPrivate) === key) renderMessage(msg);
  });

  socket.off('private message deleted'); socket.on('private message deleted', ({ id, to }) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
    const key = duoKey(username, to);
    if (window.privateThreads[key]) window.privateThreads[key] = window.privateThreads[key].filter(m => m.id !== id);
  });

  socket.off('friend request'); socket.on('friend request', ({ from }) => {
    addRequestElement(from);
    showNotification('Nieuw vriendschapsverzoek van ' + from);
  });

  socket.off('friends updated'); socket.on('friends updated', () => {
    loadFriends();
  });

  // ------------------ Send message (main + private via server) ------------------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = (messageInput.value || '').trim();
    if (!txt) return;
    if (!username) return showNotification('Log eerst in', 'error');
    // send to server; server will emit back to sender and receiver
    socket.emit('chat message', { user: username, msg: txt, type: 'text', privateTo: currentPrivate || undefined });
    messageInput.value = '';
  });

  // Bestanden uploader
fileInput.addEventListener('change', () => { 
  fileSendBtn.style.display = (fileInput.files && fileInput.files.length) ? 'inline-block' : 'none'; 
});

fileSendBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let type = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    socket.emit('chat message', { 
      user: username, 
      msg: reader.result, 
      fileName: file.name, 
      fileType: file.type, 
      type, 
      privateTo: currentPrivate || undefined 
    });
  };
  reader.readAsDataURL(file);

  fileInput.value = '';
  fileSendBtn.style.display = 'none';
});

// Nieuwe Toevoegen methode (via server upload)
fileSendBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    // type bepalen: image / video / audio / file
    let type = 'file';
    if (data.type.startsWith('image/')) type = 'image';
    else if (data.type.startsWith('video/')) type = 'video';
    else if (data.type.startsWith('audio/')) type = 'audio';

    // bericht uitsturen
    socket.emit('chat message', { 
      user: username, 
      msg: data.url, 
      fileName: data.name, 
      fileType: data.type, 
      type, 
      privateTo: currentPrivate || undefined 
    });

    fileInput.value = '';
    fileSendBtn.style.display = 'none';
  } catch (err) {
    console.error('Upload mislukt:', err);
  }
});

  // fullscreen viewer
  document.addEventListener('click', (e) => {
  if (e.target.classList.contains('clickable-media')) {
    fullscreenViewer.innerHTML = ''; // maak leeg
    const type = e.target.dataset.type;

    if (type === 'image') {
      const img = document.createElement('img');
      img.src = e.target.src;
      img.style.maxWidth = '90%';
      img.style.maxHeight = '90%';
      fullscreenViewer.appendChild(img);
    } else if (type === 'video') {
      const vid = document.createElement('video');
      vid.src = e.target.src;
      vid.controls = true;
      vid.autoplay = true;
      vid.style.maxWidth = '90%';
      vid.style.maxHeight = '90%';
      fullscreenViewer.appendChild(vid);
    }

    fullscreenViewer.style.display = 'flex';
  }
});

fullscreenViewer.addEventListener('click', () => {
  fullscreenViewer.style.display = 'none';
  fullscreenViewer.innerHTML = '';
});

  // audio recorder
  recordBtn.addEventListener('click', async () => {
    if (!username) return showNotification('Log eerst in om op te nemen', 'error');
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => socket.emit('chat message', { user: username, msg: reader.result, type: 'audio', privateTo: currentPrivate || undefined });
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent = 'Stop opnemen';
      } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.textContent = '🎤 Opnemen';
      }
    } catch (err) { showNotification('Opname fout: ' + err.message, 'error'); }
  });

  // ------------------ Friends / requests ------------------
  function addRequestElement(from) {
    // avoid duplicates in UI
    if ([...requestsList.children].some(n => n.dataset.from === from)) return;
    const el = document.createElement('div');
    el.className = 'req';
    el.dataset.from = from;
    el.innerHTML = `<span>${from}</span>`;
    const actions = document.createElement('div'); actions.className = 'actions';
    const acc = document.createElement('button'); acc.className = 'accept'; acc.textContent = 'Accepteer';
    const rej = document.createElement('button'); rej.className = 'reject'; rej.textContent = 'Weiger';
    acc.onclick = () => respondFriendRequest(from, true, el);
    rej.onclick = () => respondFriendRequest(from, false, el);
    actions.appendChild(acc); actions.appendChild(rej); el.appendChild(actions);
    requestsList.appendChild(el);
  }

  function respondFriendRequest(from, accept, el) {
    fetch('/respondFriendRequest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: username, accept }) })
      .then(r => r.json()).then(() => {
        if (el) el.remove();
        loadFriends();
      }).catch(() => { showNotification('Fout bij beantwoording verzoek', 'error'); });
  }

  function loadFriends() {
    if (!username) return;
    fetch(`/getFriends/${username}`).then(r => r.json()).then(data => {
      friendsList.innerHTML = '';
      requestsList.innerHTML = '';
      (data.friendRequests || []).forEach(req => addRequestElement(req));
      (data.friends || []).forEach(f => {
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = f;
        const chatBtn = document.createElement('button'); chatBtn.textContent = '💬'; chatBtn.onclick = () => openPrivateChat(f);
        li.appendChild(name); li.appendChild(chatBtn); friendsList.appendChild(li);
      });
    }).catch(()=>{});
  }

  addFriendBtn.addEventListener('click', () => {
    const to = (addFriendInput.value || '').trim();
    if (!to) return showNotification('Vul gebruikersnaam in', 'error');
    if (!username) return showNotification('Log eerst in', 'error');
    if (to === username) return showNotification('Je kunt jezelf geen verzoek sturen', 'error');
    fetch('/sendFriendRequest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: username, to }) })
      .then(r => r.json()).then(d => {
        showNotification(d.message || d.error, d.message ? 'info' : 'error');
        addFriendInput.value = '';
      }).catch(()=>{ showNotification('Fout bij versturen verzoek', 'error'); });
  });

  // private chat open
  function openPrivateChat(friend) {
    currentPrivate = friend;
    threadHeader.style.display = 'flex';
    threadTitle.textContent = `Privé met ${friend}`;
    messagesList.innerHTML = '';

    const key = duoKey(username, friend);
    const msgs = window.privateThreads[key] || [];
    msgs.forEach(renderMessage);
  }

  backToMainBtn.addEventListener('click', () => {
    currentPrivate = null;
    threadHeader.style.display = 'none';
    messagesList.innerHTML = '';
    socket.emit('set username', username); // refresh main history
  });

  // prevent leaving while recording
  window.addEventListener('beforeunload', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  });
});
