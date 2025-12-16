// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = localStorage.getItem('username') || "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null;
  window.privateThreads = {};

  // -------------------- DOM References --------------------
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

  const photoInput = document.getElementById('photo-input');
  const photoSendBtn = document.getElementById('photo-send-btn');
  const recordBtn = document.getElementById('record-btn');

  const friendsSection = document.getElementById('friends-section');
  const friendsList = document.getElementById('friends-list');
  const addFriendInput = document.getElementById('add-friend-username');
  const addFriendBtn = document.getElementById('add-friend-btn');
  const requestsList = document.getElementById('requests-list');

  const fullscreenViewer = document.getElementById('fullscreen-viewer');
  const notification = document.getElementById('notification');

  const adminPanel = document.getElementById('admin-panel');
  const banInput = document.getElementById('ban-user-input');
  const banBtn = document.getElementById('ban-btn');
  const unbanBtn = document.getElementById('unban-btn');
  const resetChatBtn = document.getElementById('reset-chat-btn');

  // -------------------- Helpers --------------------
  function duoKey(a,b){ return [a,b].sort().join('_'); }

  function stringToColor(str){
    let h=0;
    for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
    return "#"+("000000"+Math.floor((Math.abs(Math.sin(h)*16777215))%16777215).toString(16)).slice(-6);
  }

  function showNotification(msg, type='info', duration=2000){
    notification.textContent = msg;
    notification.style.background = type === 'error' ? '#d73a49' : '#2ea44f';
    notification.classList.add('show');
    setTimeout(()=>notification.classList.remove('show'), duration);
  }

function applyUserState(data) {
  const adminPanel = document.getElementById('admin-panel');
  if (!adminPanel) return;

  adminPanel.style.display = data.isAdmin ? 'block' : 'none';
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
        embed=`<br><video class="clickable-video" data-src="${url}" src="${url}" controls width="300"></video>`;
      } else if(url.match(/\.(mp3|wav|ogg)$/i)){
        embed=`<br><audio controls src="${url}"></audio>`;
      } else if(url.match(/\.(jpg|jpeg|png|gif|webp)$/i)){
        embed=`<br><img class="clickable-photo" src="${url}" alt="afbeelding">`;
      }
      return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${embed}`;
    });
  }

  function renderMessage(data){
    if(!data || !data.id) return;
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
      msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;
    } else if (data.type === 'video') {
      msgSpan.innerHTML = `<video class="clickable-video" data-src="${data.msg}" src="${data.msg}" controls width="250"></video>`;
    } else if (data.type === 'audio') {
      msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    } else if (data.type === 'file') {
      msgSpan.innerHTML = `<a href="${data.msg}" download="${data.name}">📎 ${data.name}</a>`;
    } else {
      msgSpan.innerHTML = formatMessage(data.msg);
    }

    li.appendChild(userSpan);
    li.appendChild(msgSpan);

    // Context menu: delete
    li.addEventListener('contextmenu', (e)=> {
      e.preventDefault();
      if (data.user !== username && adminPanel.style.display!=='block') return;
      if (!confirm('Bericht verwijderen?')) return;
      if (data.privateTo) {
        socket.emit('delete private message', { id: data.id, to: data.privateTo });
      } else {
        socket.emit('delete message', data.id);
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // -------------------- Auth --------------------
async function tryAutoLogin() {
  if (!username) return;

  try {
    const res = await fetch(`/me/${username}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    loginContainer.style.display = 'none';
    logoutBtn.style.display = 'block';
    chatContainer.style.display = 'flex';
    friendsSection.style.display = 'block';

    socket.emit('set username', username);
    applyUserState(data); // ✅ HIER

    showNotification(`Welkom terug, ${username}`);
    loadFriends();
  } catch (err) {
    localStorage.removeItem('username');
  }
}

  registerBtn.addEventListener('click', async () => {
    const user = (registerUsername.value||'').trim();
    const pass = (registerPassword.value||'').trim();
    if(!user || !pass) return showNotification('Vul alles in', 'error');
    try {
      const res = await fetch('/register',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass })});
      const data = await res.json();
      showNotification(data.message || data.error, data.message ? 'info' : 'error');
    } catch(err){ showNotification('Fout: '+err.message, 'error'); }
  });

  loginBtn.addEventListener('click', async () => {
    const user = (loginUsername.value||'').trim();
    const pass = (loginPassword.value||'').trim();
    if(!user || !pass) return showNotification('Vul alles in', 'error');
    try {
      const res = await fetch('/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass })});
      const data = await res.json();
      if(data.message){
        username = user;
        localStorage.setItem('username', username);
        loginContainer.style.display = 'none';
        logoutBtn.style.display = 'block';
        chatContainer.style.display = 'flex';
        friendsSection.style.display = 'block';
        socket.emit('set username', username);
        applyUserState(data); // 👈 TOEVOEGEN
        showNotification('Inloggen gelukt');
        loadFriends();
        if(data.isAdmin) adminPanel.style.display='block';
      } else showNotification(data.error || 'Login mislukt','error');
    } catch(err){ showNotification('Fout: '+err.message,'error'); }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('username');
    username='';
    loginContainer.style.display='block';
    logoutBtn.style.display='none';
    chatContainer.style.display='none';
    friendsSection.style.display='none';
    messagesList.innerHTML='';
    currentPrivate=null;
    showNotification('Uitgelogd');
  });

  if(username) tryAutoLogin();

  // -------------------- Admin Functionaliteit --------------------
  banBtn.addEventListener('click', async () => {
    const target = banInput.value.trim();
    if(!target) return showNotification('Vul gebruikersnaam in','error');
    const res = await fetch('/admin/ban',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ admin: username, target })});
    const data = await res.json();
    showNotification(data.message||data.error, data.message ? 'info':'error');
  });

  unbanBtn.addEventListener('click', async () => {
    const target = banInput.value.trim();
    if(!target) return showNotification('Vul gebruikersnaam in','error');
    const res = await fetch('/admin/unban',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ admin: username, target })});
    const data = await res.json();
    showNotification(data.message||data.error, data.message ? 'info':'error');
  });

  resetChatBtn.addEventListener('click', async () => {
    const res = await fetch('/admin/reset-chat',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ admin: username })});
    const data = await res.json();
    showNotification(data.message||data.error, data.message ? 'info':'error');
  });

  // -------------------- Socket events --------------------
  socket.on('force logout', ({ reason }) => {
    showNotification(reason || 'Uitgelogd door admin','error');
    localStorage.removeItem('username');
    window.location.reload();
  });

  socket.on('chat history', (msgs) => {
    if(currentPrivate) return;
    messagesList.innerHTML='';
    (msgs||[]).forEach(renderMessage);
  });

  socket.on('chat message', msg => {
    if(currentPrivate) return;
    if(msg.privateTo) return;
    renderMessage(msg);
  });

  socket.on('message deleted', id => {
    const el = document.getElementById(`msg-${id}`);
    if(el) el.remove();
  });

  socket.on('load private chats', threads => {
    window.privateThreads = threads||{};
    if(currentPrivate) openPrivateChat(currentPrivate);
  });

  socket.on('private message', msg => {
    const key = duoKey(msg.user,msg.privateTo||username);
    if(!window.privateThreads[key]) window.privateThreads[key]=[];
    if(!window.privateThreads[key].some(m=>m.id===msg.id)) window.privateThreads[key].push(msg);
    if(currentPrivate && duoKey(username,currentPrivate)===key) renderMessage(msg);
  });

  socket.on('private message deleted', ({id,to}) => {
    const el = document.getElementById(`msg-${id}`);
    if(el) el.remove();
    const key = duoKey(username,to);
    if(window.privateThreads[key]) window.privateThreads[key] = window.privateThreads[key].filter(m=>m.id!==id);
  });

  // -------------------- Chat form --------------------
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const txt = (messageInput.value||'').trim();
    if(!txt) return;
    if(!username) return showNotification('Log eerst in','error');
    socket.emit('chat message',{ user: username, msg: txt, type: 'text', privateTo: currentPrivate||undefined });
    messageInput.value='';
  });

  // -------------------- Private chat --------------------
  function openPrivateChat(friend){
    currentPrivate=friend;
    threadHeader.style.display='flex';
    threadTitle.textContent=`Privé met ${friend}`;
    messagesList.innerHTML='';
    const key = duoKey(username,friend);
    (window.privateThreads[key]||[]).forEach(renderMessage);
  }

  backToMainBtn.addEventListener('click', () => {
    currentPrivate=null;
    threadHeader.style.display='none';
    messagesList.innerHTML='';
    socket.emit('set username', username);
  });

  // -------------------- Friends --------------------
  function addRequestElement(from){
    if([...requestsList.children].some(n=>n.dataset.from===from)) return;
    const el = document.createElement('div');
    el.className='req';
    el.dataset.from=from;
    el.innerHTML=`<span>${from}</span>`;
    const actions = document.createElement('div'); actions.className='actions';
    const acc = document.createElement('button'); acc.className='accept'; acc.textContent='Accepteer';
    const rej = document.createElement('button'); rej.className='reject'; rej.textContent='Weiger';
    acc.onclick=()=>respondFriendRequest(from,true,el);
    rej.onclick=()=>respondFriendRequest(from,false,el);
    actions.appendChild(acc); actions.appendChild(rej); el.appendChild(actions);
    requestsList.appendChild(el);
  }

  function respondFriendRequest(from,accept,el){
    fetch('/respondFriendRequest',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from, to: username, accept })})
      .then(r=>r.json()).then(()=>{ if(el) el.remove(); loadFriends(); })
      .catch(()=>showNotification('Fout bij beantwoording verzoek','error'));
  }

  function loadFriends(){
    if(!username) return;
    fetch(`/getFriends/${username}`).then(r=>r.json()).then(data=>{
      friendsList.innerHTML='';
      requestsList.innerHTML='';
      (data.friendRequests||[]).forEach(req=>addRequestElement(req));
      (data.friends||[]).forEach(f=>{
        const li=document.createElement('li');
        const name=document.createElement('span'); name.textContent=f;
        const chatBtn=document.createElement('button'); chatBtn.textContent='💬'; chatBtn.onclick=()=>openPrivateChat(f);
        li.appendChild(name); li.appendChild(chatBtn);
        friendsList.appendChild(li);
      });
    }).catch(()=>{});
  }

  addFriendBtn.addEventListener('click', ()=>{
    const to=(addFriendInput.value||'').trim();
    if(!to) return showNotification('Vul gebruikersnaam in','error');
    if(!username) return showNotification('Log eerst in','error');
    if(to===username) return showNotification('Je kunt jezelf geen verzoek sturen','error');
    fetch('/sendFriendRequest',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ from: username, to })})
      .then(r=>r.json()).then(d=>{ showNotification(d.message||d.error, d.message?'info':'error'); addFriendInput.value=''; })
      .catch(()=>showNotification('Fout bij versturen verzoek','error'));
  });

  // -------------------- Photo/Video/Audio --------------------
  photoSendBtn.addEventListener('click', ()=>{
    if(!photoInput.files.length) return;
    const file = photoInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user', username);
    if(currentPrivate) formData.append('privateTo', currentPrivate);
    fetch('/upload', { method:'POST', body: formData })
      .then(r=>r.json()).then(d=>{
        if(d.error) showNotification(d.error,'error');
        else photoInput.value='';
      }).catch(()=>showNotification('Upload mislukt','error'));
  });

  // -------------------- Audio recorder --------------------
  recordBtn.addEventListener('click', async ()=>{
    if(recordBtn.textContent==='🎙️ Start'){
      if(!navigator.mediaDevices) return showNotification('Microfoon niet beschikbaar','error');
      try{
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks=[];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunks,{type:'audio/webm'});
          const formData = new FormData();
          formData.append('file', blob, 'voice.webm');
          formData.append('user', username);
          if(currentPrivate) formData.append('privateTo', currentPrivate);
          fetch('/upload',{ method:'POST', body: formData }).then(r=>r.json()).then(d=>{
            if(d.error) showNotification(d.error,'error');
          }).catch(()=>showNotification('Upload mislukt','error'));
        };
        mediaRecorder.start();
        recordBtn.textContent='⏹️ Stop';
      } catch { showNotification('Geen microfoon toegang','error'); }
    } else {
      if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop();
      recordBtn.textContent='🎙️ Start';
    }
  });

  // -------------------- Fullscreen viewer --------------------
  fullscreenViewer.addEventListener('click', ()=>{ fullscreenViewer.style.display='none'; fullscreenViewer.innerHTML=''; });
  document.body.addEventListener('click', e=>{
    if(e.target.classList.contains('clickable-photo')){
      fullscreenViewer.style.display='flex';
      fullscreenViewer.innerHTML=`<img src="${e.target.src}">`;
    }
    if(e.target.classList.contains('clickable-video')){
      fullscreenViewer.style.display='flex';
      fullscreenViewer.innerHTML=`<video src="${e.target.dataset.src}" controls autoplay></video>`;
    }
  });

  // -------------------- Prevent leaving while recording --------------------
  window.addEventListener('beforeunload', ()=>{ if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop(); });

});
