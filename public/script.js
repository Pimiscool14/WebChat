// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null; // null = main chat; otherwise username of friend
  window.privateThreads = {}; // { "a_b": [msgs...] }

  // DOM refs (IDs must match index.html)
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

  // Theme handling (keeps previous behavior)
  const modeBtn = document.getElementById('mode-toggle');
  if (localStorage.getItem('mode') === 'light') document.body.classList.add('light');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('mode', document.body.classList.contains('light') ? 'light' : 'dark');
    });
  }

  // Utility helpers
  function duoKey(a,b){ return [a,b].sort().join('_'); }
  function stringToColor(str){
    let hash = 0;
    for (let i=0;i<str.length;i++) hash = str.charCodeAt(i) + ((hash<<5)-hash);
    const color = Math.floor((Math.abs(Math.sin(hash) * 16777215)) % 16777215);
    return "#" + ("000000" + color.toString(16)).slice(-6);
  }

  // Full-featured formatMessage with embeds
  function formatMessage(text){
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      let embed = "";

      // YouTube
      if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")) {
        let vid = url.includes("youtube.com") ? (new URL(url).searchParams.get('v')) : url.split('/').pop();
        if (vid) embed = `<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>`;
      }
      // Vimeo
      else if (url.includes("vimeo.com/")) {
        const vid = url.split('vimeo.com/')[1];
        if (vid) embed = `<br><iframe src="https://player.vimeo.com/video/${vid}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;
      }
      // TikTok
      else if (url.includes('tiktok.com')) {
        embed = `<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;
      }
      // direct video file
      else if (url.match(/\.(mp4|webm|ogg)$/i)) {
        embed = `<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video</video>`;
      }
      // audio file
      else if (url.match(/\.(mp3|wav|ogg)$/i)) {
        embed = `<br><audio controls><source src="${url}">Je browser ondersteunt geen audio</audio>`;
      }
      // image file
      else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        embed = `<br><img class="clickable-photo" src="${url}" alt="afbeelding">`;
      }

      return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${embed}`;
    });
  }

  // -----------------------
  // Register & Login logic
  // -----------------------
  registerBtn.addEventListener('click', async () => {
    const user = (registerUsername.value || '').trim();
    const pass = (registerPassword.value || '').trim();
    if (!user || !pass) { alert('Vul gebruikersnaam en wachtwoord in'); return; }
    try {
      const res = await fetch('/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      alert(data.message || data.error);
      if (data.message) {
        registerUsername.value = '';
        registerPassword.value = '';
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  loginBtn.addEventListener('click', async () => {
    const user = (loginUsername.value || '').trim();
    const pass = (loginPassword.value || '').trim();
    if (!user || !pass) { alert('Vul gebruikersnaam en wachtwoord in'); return; }
    try {
      const res = await fetch('/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (data.message) {
        username = user;
        // show chat UI, hide login UI
        loginContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        friendsSection.style.display = 'block';
        socket.emit('set username', username);
        loadFriends();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // -----------------------
  // Message rendering
  // -----------------------
  function addMessageToList(data){
    // data: { id, user, msg, type, privateTo? }
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;

    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight = 'bold';
    userSpan.style.marginRight = '6px';

    const msgSpan = document.createElement('span');

    if (data.type === 'image') {
      // if msg is dataURL or url embed it as image tag
      msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;
    } else if (data.type === 'audio') {
      msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    } else {
      msgSpan.innerHTML = formatMessage(data.msg);
    }

    li.appendChild(userSpan);
    li.appendChild(msgSpan);

    // Only allow deletion for own messages in main chat (privateTo undefined/null)
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!data.privateTo && data.user === username) {
        if (confirm('Bericht verwijderen?')) socket.emit('delete message', data.id);
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // Socket handlers for main chat
  socket.on('chat history', (msgs) => {
    // only display main chat if not in a private conversation
    if (currentPrivate !== null) return;
    messagesList.innerHTML = '';
    (msgs || []).forEach(addMessageToList);
  });

  socket.on('chat message', (msg) => {
    if (currentPrivate === null) addMessageToList(msg);
  });

  socket.on('message deleted', (id) => {
    const li = document.getElementById(`msg-${id}`);
    if (li) li.remove();
  });

  // Private threads loader (persistent)
  socket.on('load private chats', (threads) => {
    window.privateThreads = threads || {};
    // if currently in a private thread, redraw it
    if (currentPrivate) openPrivateChat(currentPrivate);
  });

  // Private message incoming
  socket.on('private message', (msg) => {
    // store in window.privateThreads
    const other = msg.privateTo ? msg.privateTo : null;
    // msg.user is sender, msg.privateTo is receiver OR if server emits to both sides, msg may have privateTo
    // deduce key: if msg.privateTo exists => key between msg.user and msg.privateTo
    const key = duoKey(msg.user, msg.privateTo || username);
    if (!window.privateThreads[key]) window.privateThreads[key] = [];
    window.privateThreads[key].push(msg);

    // If this thread is open, show it
    if (currentPrivate && duoKey(username, currentPrivate) === key) {
      addMessageToList(msg);
    } else {
      // optional: show a small notification in friends list (left as exercise)
    }
  });

  // -----------------------
  // Sending messages
  // -----------------------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!username) { alert('Log eerst in'); return; }
    const text = messageInput.value.trim();
    if (!text) return;
    // send privateTo if in private chat
    socket.emit('chat message', {
      user: username,
      msg: text,
      type: 'text',
      privateTo: currentPrivate // null or friend username
    });
    messageInput.value = '';
  });

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // -----------------------
  // Photo uploader w/ send button
  // -----------------------
  photoInput.addEventListener('change', () => {
    if (photoInput.files && photoInput.files.length) {
      photoSendBtn.style.display = 'inline-block';
    } else {
      photoSendBtn.style.display = 'none';
    }
  });

  photoSendBtn.addEventListener('click', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('chat message', {
        user: username,
        msg: reader.result,
        type: 'image',
        privateTo: currentPrivate
      });
    };
    reader.readAsDataURL(file);
    photoInput.value = '';
    photoSendBtn.style.display = 'none';
  });

  // Fullscreen viewer (overlay)
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('clickable-photo')) {
      const src = e.target.src;
      fullscreenImg.src = src;
      fullscreenViewer.style.display = 'flex';
    }
  });
  // exit fullscreen viewer on click
  fullscreenViewer.addEventListener('click', () => {
    fullscreenViewer.style.display = 'none';
    fullscreenImg.src = '';
    // also exit document fullscreen if used
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  });

  // -----------------------
  // Voice recording
  // -----------------------
  recordBtn.addEventListener('click', async () => {
    if (!username) { alert('Log eerst in om op te nemen'); return; }
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            socket.emit('chat message', {
              user: username,
              msg: reader.result,
              type: 'audio',
              privateTo: currentPrivate
            });
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent = 'Stop opnemen';
      } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.textContent = '🎤 Opnemen';
      }
    } catch (err) {
      alert('Opname fout: ' + err.message);
    }
  });

  // -----------------------
  // Friends UI + requests
  // -----------------------
  function showFriendRequestPopup(from) {
    // create popup element
    const wrap = document.createElement('div');
    wrap.className = 'popup';
    const txt = document.createElement('span');
    txt.textContent = `Verzoek van ${from}`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const acc = document.createElement('button');
    acc.textContent = 'Accepteer';
    const rej = document.createElement('button');
    rej.textContent = 'Weiger';
    acc.onclick = () => respondFriendRequest(from, true, wrap);
    rej.onclick = () => respondFriendRequest(from, false, wrap);
    actions.appendChild(acc);
    actions.appendChild(rej);
    wrap.appendChild(txt);
    wrap.appendChild(actions);
    friendRequestPopup.appendChild(wrap);
  }

  function respondFriendRequest(from, accept, elementToRemove) {
    fetch('/respondFriendRequest', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ from, to: username, accept })
    }).then(r => r.json()).then(() => {
      if (elementToRemove) elementToRemove.remove();
      loadFriends();
    }).catch(()=>{});
  }

  // load friends and pending requests (requests will be shown as popup)
  function loadFriends() {
    if (!username) return;
    fetch(`/getFriends/${username}`)
      .then(r => r.json())
      .then(data => {
        friendsList.innerHTML = '';
        friendRequestPopup.innerHTML = '';
        (data.friends || []).forEach(f => {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = f;
          const chatBtn = document.createElement('button');
          chatBtn.textContent = '💬';
          chatBtn.title = `Privéchat met ${f}`;
          chatBtn.onclick = () => openPrivateChat(f);
          li.appendChild(nameSpan);
          li.appendChild(chatBtn);
          friendsList.appendChild(li);
        });
        (data.friendRequests || []).forEach(reqFrom => showFriendRequestPopup(reqFrom));
      })
      .catch(()=>{});
  }

  // Realtime: friend request event from server
  socket.on('friend request', ({ from }) => {
    showFriendRequestPopup(from);
  });

  // Realtime: friends list updated
  socket.on('friends updated', () => { loadFriends(); });

  // send friend request
  addFriendBtn.addEventListener('click', () => {
    const to = (addFriendInput.value || '').trim();
    if (!to) return;
    if (!username) { alert('Log eerst in'); return; }
    if (to === username) { alert('Je kunt jezelf geen verzoek sturen'); return; }
    fetch('/sendFriendRequest', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ from: username, to })
    }).then(r=>r.json()).then(d => {
      alert(d.message || d.error);
      addFriendInput.value = '';
    }).catch(err => alert('Fout: ' + err.message));
  });

  // -----------------------
  // Private chat open / close
  // -----------------------
  function openPrivateChat(friend) {
    // ensure friend is in your friends list before opening (server also checks on send)
    currentPrivate = friend;
    messagesList.innerHTML = '';
    // load saved messages for this thread from window.privateThreads
    const key = duoKey(username, friend);
    const msgs = window.privateThreads[key] || [];
    msgs.forEach(addMessageToList);
  }

  // function to go back to main chat
  function goToMainChat() {
    currentPrivate = null;
    messagesList.innerHTML = '';
    // re-request main chat? the server sends chat history on set username and we have it; easiest is to request reload via simple fetch or rely on socket event - here we'll fetch mainChat.json implicitly via socket (emit nothing). Simpler: ask server to resend by re-setting username.
    if (username) socket.emit('set username', username);
  }

  // optional: add a small UI button to return to general chat if desired
  // (not in original HTML, you can add it later and call goToMainChat)

  // -----------------------
  // Misc: warn before leaving if recording
  // -----------------------
  window.addEventListener('beforeunload', (e) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  });

  // End of DOMContentLoaded
});
