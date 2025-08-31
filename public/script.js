// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null;
  window.privateThreads = {};

  // --- DOM refs ---
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
  const friendRequestPopup = document.getElementById('friend-request-popup');

  const fullscreenViewer = document.getElementById('fullscreen-viewer');
  const fullscreenImg = document.getElementById('fullscreen-img');

  // --- Helpers ---
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

  function showNotification(msg,type='success'){
    let div = document.createElement('div');
    div.id='notification';
    div.textContent = msg;
    div.style.background = type==='success'?'#2ea44f':'#d73a49';
    document.body.appendChild(div);
    setTimeout(()=>{ div.classList.add('show'); },10);
    setTimeout(()=>{ div.classList.remove('show'); setTimeout(()=>div.remove(),300); },3000);
  }

  function renderMessage(data){
    const li = document.createElement('li');
    li.id = `msg-${data.id}`;
    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight='bold';
    userSpan.style.marginRight='6px';
    const msgSpan = document.createElement('span');
    if(data.type==='image') msgSpan.innerHTML = `<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;
    else if(data.type==='audio') msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML = formatMessage(data.msg);
    li.appendChild(userSpan); li.appendChild(msgSpan);

    li.addEventListener('contextmenu',(e)=>{
      e.preventDefault();
      if(data.user===username){
        if(confirm('Bericht verwijderen?')) socket.emit('delete message', {id:data.id, privateTo:data.privateTo||null});
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({behavior:'smooth', block:'end'});
  }

  // --- REGISTER ---
  registerBtn.addEventListener('click', async()=>{
    const user = (registerUsername.value||'').trim();
    const pass = (registerPassword.value||'').trim();
    if(!user||!pass)return showNotification('Vul gebruikersnaam en wachtwoord in','error');
    try{
      const res = await fetch('/register',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:user,password:pass})});
      const data = await res.json();
      showNotification(data.message||data.error, data.message?'success':'error');
      if(data.message){registerUsername.value=''; registerPassword.value='';}
    }catch(err){ showNotification('Fout: '+err.message,'error'); }
  });

  // --- LOGIN ---
  loginBtn.addEventListener('click', async()=>{
    const user = (loginUsername.value||'').trim();
    const pass = (loginPassword.value||'').trim();
    if(!user||!pass) return showNotification('Vul gebruikersnaam en wachtwoord in','error');
    try{
      const res = await fetch('/login',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:user,password:pass})});
      const data = await res.json();
      if(data.message){
        username = user;
        localStorage.setItem('username', username);
        loginContainer.style.display='none';
        chatContainer.style.display='flex';
        friendsSection.style.display='block';
        logoutBtn.style.display='inline-block';
        socket.emit('set username',username);
        loadFriends();
        showNotification('Inloggen gelukt!','success');
      } else showNotification(data.error,'error');
    }catch(err){ showNotification('Fout: '+err.message,'error'); }
  });

  // --- AUTO LOGIN ---
  const savedUser = localStorage.getItem('username');
  if(savedUser){
    username = savedUser;
    loginContainer.style.display='none';
    chatContainer.style.display='flex';
    friendsSection.style.display='block';
    logoutBtn.style.display='inline-block';
    socket.emit('set username', username);
    loadFriends();
    showNotification(`Welkom terug, ${username}!`,'success');
  }

  // --- LOGOUT ---
  logoutBtn.addEventListener('click', ()=>{
    localStorage.removeItem('username');
    username='';
    loginContainer.style.display='block';
    chatContainer.style.display='none';
    friendsSection.style.display='none';
    logoutBtn.style.display='none';
    messagesList.innerHTML='';
    currentPrivate=null;
  });

  // --- SOCKET EVENTS ---
  socket.off('chat history'); socket.on('chat history',(msgs)=>{
    if(currentPrivate!==null)return;
    messagesList.innerHTML='';
    (msgs||[]).forEach(renderMessage);
  });

  socket.off('chat message'); socket.on('chat message', msg=>{
    if(currentPrivate===null) renderMessage(msg);
  });

  socket.off('message deleted'); socket.on('message deleted', data=>{
    const el = document.getElementById(`msg-${data.id}`);
    if(el) el.remove();
    // verwijderd ook uit privé als het bestaat
    if(data.privateTo){
      const key = duoKey(username,data.privateTo);
      if(window.privateThreads[key]) window.privateThreads[key] = window.privateThreads[key].filter(m=>m.id!==data.id);
    }
  });

  socket.off('load private chats'); socket.on('load private chats',(threads)=>{
    window.privateThreads = threads||{};
    if(currentPrivate) openPrivateChat(currentPrivate);
  });

  socket.off('private message'); socket.on('private message',msg=>{
    const key = duoKey(msg.user,msg.privateTo||username);
    if(!window.privateThreads[key]) window.privateThreads[key] = [];
    window.privateThreads[key].push(msg);
    if(currentPrivate && duoKey(username,currentPrivate)===key) renderMessage(msg);
  });

  // --- SEND MESSAGE ---
  chatForm.addEventListener('submit',(e)=>{
    e.preventDefault();
    if(!username) return showNotification('Log eerst in','error');
    const txt = (messageInput.value||'').trim();
    if(!txt) return;
    socket.emit('chat message',{user:username,msg:txt,type:'text',privateTo:currentPrivate});
    messageInput.value='';
  });

  // --- PHOTO UPLOAD ---
  photoInput.addEventListener('change',()=>{ photoSendBtn.style.display=(photoInput.files&&photoInput.files.length)?'inline-block':'none'; });
  photoSendBtn.addEventListener('click',()=>{
    const file = photoInput.files[0]; if(!file)return;
    const reader = new FileReader();
    reader.onload=()=>socket.emit('chat message',{user:username,msg:reader.result,type:'image',privateTo:currentPrivate});
    reader.readAsDataURL(file);
    photoInput.value=''; photoSendBtn.style.display='none';
  });

  // --- FULLSCREEN ---
  document.addEventListener('click',(e)=>{
    if(e.target.classList.contains('clickable-photo')){
      fullscreenImg.src=e.target.src;
      fullscreenViewer.style.display='flex';
    }
  });
  fullscreenViewer.addEventListener('click',()=>{ fullscreenViewer.style.display='none'; fullscreenImg.src=''; });

  // --- VOICE ---
  recordBtn.addEventListener('click', async()=>{
    if(!username) return showNotification('Log eerst in om op te nemen','error');
    try{
      if(!mediaRecorder || mediaRecorder.state==='inactive'){
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder = new MediaRecorder(stream);
        audioChunks=[];
        mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
        mediaRecorder.onstop=()=>{
          const blob = new Blob(audioChunks,{type:'audio/webm'});
          const reader = new FileReader();
          reader.onload=()=>socket.emit('chat message',{user:username,msg:reader.result,type:'audio',privateTo:currentPrivate});
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent='Stop opnemen';
      } else if(mediaRecorder.state==='recording'){
        mediaRecorder.stop();
        recordBtn.textContent='🎤 Opnemen';
      }
    } catch(err){ showNotification('Opname fout: '+err.message,'error'); }
  });

  // --- FRIENDS & REQUESTS ---
  function addRequestElement(from){
    const el = document.createElement('div');
    el.className='req';
    el.innerHTML=`<span>${from}</span>`;
    const actions = document.createElement('div');
    actions.className='actions';
    const acc = document.createElement('button'); acc.className='accept'; acc.textContent='Accepteer'; acc.onclick=()=>respondFriendRequest(from,true,el);
    const rej = document.createElement('button'); rej.className='reject'; rej.textContent='Weiger'; rej.onclick=()=>respondFriendRequest(from,false,el);
    actions.appendChild(acc); actions.appendChild(rej); el.appendChild(actions);
    requestsList.appendChild(el);
  }

  function respondFriendRequest(from,accept,el){
    fetch('/respondFriendRequest',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({from,to:username,accept})})
      .then(r=>r.json()).then(()=>{ if(el)el.remove(); loadFriends(); }).catch(()=>{});
  }

  function loadFriends(){
    if(!username) return;
    fetch(`/getFriends/${username}`).then(r=>r.json()).then(data=>{
      friendsList.innerHTML=''; requestsList.innerHTML='';
      (data.friendRequests||[]).forEach(req=>addRequestElement(req));
      (data.friends||[]).forEach(f=>{
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent=f;
        const chatBtn = document.createElement('button'); chatBtn.textContent='💬'; chatBtn.onclick=()=>openPrivateChat(f);
        li.appendChild(name); li.appendChild(chatBtn); friendsList.appendChild(li);
      });
    }).catch(()=>{});
  }

  socket.off('friend request'); socket.on('friend request',({from})=>addRequestElement(from));
  socket.off('friends updated'); socket.on('friends updated',()=>loadFriends());

  addFriendBtn.addEventListener('click',()=>{
    const to = (addFriendInput.value||'').trim();
    if(!to) return; if(!username) return showNotification('Log eerst in','error');
    if(to===username) return showNotification('Je kunt jezelf geen verzoek sturen','error');
    fetch('/sendFriendRequest',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({from:username,to})})
      .then(r=>r.json()).then(d=>{ showNotification(d.message||d.error,d.message?'success':'error'); addFriendInput.value=''; });
  });

  // --- PRIVATE CHAT ---
  function openPrivateChat(friend){
    currentPrivate=friend;
    messagesList.innerHTML='';
    threadHeader.style.display='flex';
    threadTitle.textContent=`Privé met ${friend}`;
    const key = duoKey(username,friend);
    const msgs = window.privateThreads[key]||[];
    msgs.forEach(renderMessage);
  }

  backToMainBtn.addEventListener('click',()=>{
    currentPrivate=null;
    threadHeader.style.display='none';
    messagesList.innerHTML='';
    if(username) socket.emit('set username',username);
  });

  // --- Prevent leaving while recording ---
  window.addEventListener('beforeunload',()=>{
    if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop();
  });

});
