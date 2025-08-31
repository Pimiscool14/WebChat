document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = localStorage.getItem('username') || "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null;
  window.privateThreads = {};

  // DOM references
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

  const notification = document.getElementById('notification');

  // Utility
  function duoKey(a,b){ return [a,b].sort().join('_'); }
  function stringToColor(str){ let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h); return "#"+("000000"+Math.floor((Math.abs(Math.sin(h)*16777215))%16777215).toString(16)).slice(-6); }
  function showNotification(msg, duration=2000){
    notification.textContent = msg;
    notification.classList.add('show');
    setTimeout(()=>notification.classList.remove('show'), duration);
  }

  // Message formatting (text, links, embeds)
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

  // ------------------ LOGIN / REGISTER ------------------
  registerBtn.addEventListener('click', async () => {
    const user = (registerUsername.value||'').trim();
    const pass = (registerPassword.value||'').trim();
    if(!user||!pass)return alert('Vul gebruikersnaam en wachtwoord in');
    try{
      const res = await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:pass})});
      const data = await res.json();
      showNotification(data.message||data.error);
      if(data.message){registerUsername.value=''; registerPassword.value='';}
    }catch(err){alert('Fout: '+err.message);}
  });

  async function doLogin(user, pass){
    if(!user||!pass) return showNotification('Vul alles in');
    try{
      const res = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:pass})});
      const data = await res.json();
      if(data.message){
        username = user;
        localStorage.setItem('username', username);
        loginContainer.style.display='none';
        logoutBtn.style.display='block';
        chatContainer.style.display='flex';
        friendsSection.style.display='block';
        socket.emit('set username', username);
        loadFriends();
        showNotification('Inloggen gelukt');
      }else showNotification(data.error);
    }catch(err){showNotification('Fout: '+err.message);}
  }

  loginBtn.addEventListener('click',()=>doLogin(loginUsername.value,loginPassword.value));
  
  if(username) doLogin(username, ''); // try auto-login

  logoutBtn.addEventListener('click', ()=>{
    username='';
    localStorage.removeItem('username');
    loginContainer.style.display='block';
    logoutBtn.style.display='none';
    chatContainer.style.display='none';
    friendsSection.style.display='none';
    showNotification('Uitgelogd');
  });

  // ------------------ MESSAGE RENDER ------------------
  function renderMessage(data){
    const li = document.createElement('li');
    li.id=`msg-${data.id}`;

    const userSpan=document.createElement('span');
    userSpan.textContent=data.user;
    userSpan.style.color=stringToColor(data.user);
    userSpan.style.fontWeight='bold';
    userSpan.style.marginRight='6px';

    const msgSpan=document.createElement('span');
    if(data.type==='image') msgSpan.innerHTML=`<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;
    else if(data.type==='audio') msgSpan.innerHTML=`<audio controls src="${data.msg}"></audio>`;
    else msgSpan.innerHTML=formatMessage(data.msg);

    li.appendChild(userSpan);
    li.appendChild(msgSpan);

    li.addEventListener('contextmenu',(e)=>{
      e.preventDefault();
      if(data.user===username){
        if(confirm('Bericht verwijderen?')){
          if(currentPrivate){
            socket.emit('delete private message',{id:data.id, to:currentPrivate});
          }else{
            socket.emit('delete message', data.id);
          }
        }
      }
    });

    messagesList.appendChild(li);
    li.scrollIntoView({behavior:'smooth', block:'end'});
  }

  // ------------------ SOCKET EVENTS ------------------
  socket.off('chat history'); socket.on('chat history', (msgs)=>{
    if(currentPrivate) return;
    messagesList.innerHTML='';
    (msgs||[]).forEach(renderMessage);
  });

  socket.off('chat message'); socket.on('chat message', (msg)=>{
    if(currentPrivate) return;
    renderMessage(msg);
  });

  socket.off('message deleted'); socket.on('message deleted', (id)=>{
    const el=document.getElementById(`msg-${id}`);
    if(el) el.remove();
  });

  socket.off('load private chats'); socket.on('load private chats', (threads)=>{
    window.privateThreads=threads||{};
    if(currentPrivate) openPrivateChat(currentPrivate);
  });

  socket.off('private message'); socket.on('private message',(msg)=>{
    const key=duoKey(msg.user,msg.privateTo||username);
    if(!window.privateThreads[key]) window.privateThreads[key]=[];
    // Check if message already exists (prevent duplicates)
    if(!window.privateThreads[key].some(m=>m.id===msg.id)) window.privateThreads[key].push(msg);
    if(currentPrivate && duoKey(username,currentPrivate)===key) renderMessage(msg);
  });

  socket.off('private message deleted'); socket.on('private message deleted',({id,to})=>{
    const el=document.getElementById(`msg-${id}`);
    if(el) el.remove();
    // remove from local thread storage
    const key = duoKey(username,to);
    if(window.privateThreads[key]) window.privateThreads[key] = window.privateThreads[key].filter(m=>m.id!==id);
  });

  // ------------------ SEND MESSAGE ------------------
  chatForm.addEventListener('submit',(e)=>{
    e.preventDefault();
    if(!username)return alert('Log eerst in');
    const txt=(messageInput.value||'').trim();
    if(!txt)return;
    const data={user:username,msg:txt,type:'text',privateTo:currentPrivate||undefined};
    socket.emit('chat message',data);
    messageInput.value='';
  });

  // ------------------ PHOTO ------------------
  photoInput.addEventListener('change',()=>{photoSendBtn.style.display=(photoInput.files&&photoInput.files.length)?'inline-block':'none';});
  photoSendBtn.addEventListener('click',()=>{
    const file=photoInput.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=> socket.emit('chat message',{user:username,msg:reader.result,type:'image',privateTo:currentPrivate||undefined});
    reader.readAsDataURL(file);
    photoInput.value=''; photoSendBtn.style.display='none';
  });

  // ------------------ FULLSCREEN VIEWER ------------------
  document.addEventListener('click',(e)=>{
    if(e.target.classList.contains('clickable-photo')){
      fullscreenImg.src=e.target.src;
      fullscreenViewer.style.display='flex';
    }
  });
  fullscreenViewer.addEventListener('click',()=>{
    fullscreenViewer.style.display='none';
    fullscreenImg.src='';
  });

  // ------------------ VOICE ------------------
  recordBtn.addEventListener('click', async ()=>{
    if(!username)return alert('Log eerst in');
    try{
      if(!mediaRecorder||mediaRecorder.state==='inactive'){
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder=new MediaRecorder(stream);
        audioChunks=[];
        mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
        mediaRecorder.onstop=()=>{
          const blob=new Blob(audioChunks,{type:'audio/webm'});
          const reader=new FileReader();
          reader.onload=()=>socket.emit('chat message',{user:username,msg:reader.result,type:'audio',privateTo:currentPrivate||undefined});
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent='Stop opnemen';
      }else if(mediaRecorder.state==='recording'){
        mediaRecorder.stop();
        recordBtn.textContent='🎤 Opnemen';
      }
    }catch(err){alert('Opname fout: '+err.message);}
  });

  window.addEventListener('beforeunload',()=>{if(mediaRecorder&&mediaRecorder.state==='recording') mediaRecorder.stop();});

  // ------------------ FRIEND REQUEST ------------------
  function addRequestElement(from){
    const el=document.createElement('div');
    el.className='req';
    el.innerHTML=`<span>${from}</span>`;
    const actions=document.createElement('div');
    actions.className='actions';
    const acc=document.createElement('button');
    acc.className='accept'; acc.textContent='Accepteer';
    const rej=document.createElement('button');
    rej.className='reject'; rej.textContent='Weiger';
    acc.onclick=()=>respondFriendRequest(from,true,el);
    rej.onclick=()=>respondFriendRequest(from,false,el);
    actions.appendChild(acc); actions.appendChild(rej);
    el.appendChild(actions);
    requestsList.appendChild(el);
  }

  function respondFriendRequest(from,accept,el){
    fetch('/respondFriendRequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from,to:username,accept})})
      .then(r=>r.json()).then(()=>{if(el) el.remove(); loadFriends();}).catch(()=>{});
  }

  function loadFriends(){
    if(!username) return;
    fetch(`/getFriends/${username}`).then(r=>r.json()).then(data=>{
      friendsList.innerHTML=''; requestsList.innerHTML='';
      (data.friendRequests||[]).forEach(req=>addRequestElement(req));
      (data.friends||[]).forEach(f=>{
        const li=document.createElement('li');
        const name=document.createElement('span'); name.textContent=f;
        const chatBtn=document.createElement('button'); chatBtn.textContent='Chat'; chatBtn.onclick=()=>openPrivateChat(f);
        li.appendChild(name); li.appendChild(chatBtn);
        friendsList.appendChild(li);
      });
    });
  }

  addFriendBtn.addEventListener('click',()=>{
    const to=(addFriendInput.value||'').trim();
    if(!to)return;
    fetch('/sendFriendRequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:username,to})})
      .then(r=>r.json()).then(()=>{addFriendInput.value=''; showNotification('Verzoek verzonden');});
  });

  function openPrivateChat(friend){
    currentPrivate=friend;
    threadHeader.style.display='flex';
    threadTitle.textContent='Privé: '+friend;
    messagesList.innerHTML='';
    const key=duoKey(username,friend);
    (window.privateThreads[key]||[]).forEach(renderMessage);
  }

  backToMainBtn.addEventListener('click',()=>{
    currentPrivate=null;
    threadHeader.style.display='none';
    messagesList.innerHTML='';
    socket.emit('request chat history');
  });

});
