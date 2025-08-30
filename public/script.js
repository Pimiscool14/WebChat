document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";
  let mediaRecorder, audioChunks = [];
  let currentPrivate = null;

  // DOM
  const modeBtn = document.getElementById('mode-toggle');
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');
  const chatSection = document.getElementById('chat-section');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');
  const photoInput = document.getElementById('photo-input');
  const photoSendBtn = document.getElementById('photo-send-btn');
  const recordBtn = document.getElementById('record-btn');
  const friendsList = document.getElementById('friends-list');
  const requestsContainer = document.getElementById('requests-container');

  window.privateMessages = {};

  // Theme
  if(localStorage.getItem('mode')==='light') document.body.classList.add('light');
  modeBtn.addEventListener('click', ()=>{document.body.classList.toggle('light'); localStorage.setItem('mode', document.body.classList.contains('light')?'light':'dark');});

  function stringToColor(str){let hash=0; for(let i=0;i<str.length;i++){hash=str.charCodeAt(i)+((hash<<5)-hash);} return "#"+("000000"+Math.floor(Math.abs(Math.sin(hash)*16777215)%16777215).toString(16)).slice(-6);}
  function formatMessage(text){
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url=>{
      let embed='';
      if(url.includes('youtube.com/watch?v=')||url.includes('youtu.be/')){
        let vid=url.includes('youtube.com')?new URL(url).searchParams.get('v'):url.split('/').pop();
        if(vid) embed=`<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>`;
      } else if(url.includes('vimeo.com/')){embed=`<br><iframe src="https://player.vimeo.com/video/${url.split('vimeo.com/')[1]}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;}
      else if(url.includes('tiktok.com')){embed=`<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;}
      else if(url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) embed=`<br><img class="clickable-photo" src="${url}" alt="afbeelding">`;
      else if(url.match(/\.(mp4|webm|ogg)$/i)) embed=`<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video</video>`;
      else if(url.match(/\.(mp3|wav|ogg)$/i)) embed=`<br><audio controls><source src="${url}">Je browser ondersteunt geen audio</audio>`;
      return `<a href="${url}" target="_blank" style="color:blue">${url}</a>${embed}`;
    });
  }

  // Register/Login
  registerForm.addEventListener('submit', async e => { e.preventDefault(); const res=await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('reg-username').value,password:document.getElementById('reg-password').value})}); const data=await res.json(); alert(data.message||data.error);});
  loginForm.addEventListener('submit', async e => {
    e.preventDefault(); const logUser=document.getElementById('log-username').value; const logPass=document.getElementById('log-password').value;
    const res = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:logUser,password:logPass})}); const data=await res.json();
    if(data.message){username=logUser; alert(data.message); loginForm.style.display='none'; registerForm.style.display='none'; chatSection.style.display='block'; modeBtn.style.display='inline-block'; socket.emit('set username',username); loadFriends();}
    else alert(data.error);
  });

  // Messages
  function addMessageToList(data){
    const li=document.createElement('li'); li.id=`msg-${data.id}`;
    const userSpan=document.createElement('span'); userSpan.textContent=data.user; userSpan.style.color=stringToColor(data.user); userSpan.style.fontWeight='bold'; userSpan.style.marginRight='6px';
    const msgSpan=document.createElement('span');
    if(data.type==='image'){msgSpan.innerHTML=`<img class="clickable-photo" src="${data.msg}" alt="afbeelding">`;}
    else if(data.type==='audio'){msgSpan.innerHTML=`<audio controls src="${data.msg}"></audio>`;}
    else{msgSpan.innerHTML=formatMessage(data.msg);}
    li.appendChild(userSpan); li.appendChild(msgSpan);
    li.addEventListener('contextmenu', e=>{e.preventDefault(); if(data.user===username){if(confirm('Bericht verwijderen?')) socket.emit('delete message',data.id);}});
    messagesList.appendChild(li); li.scrollIntoView({behavior:'smooth',block:'end'});
  }

  socket.on('chat history', msgs=>{messagesList.innerHTML=''; msgs.forEach(addMessageToList);});
  socket.on('chat message', addMessageToList);
  socket.on('message deleted',id=>{const li=document.getElementById(`msg-${id}`); if(li) li.remove();});

  socket.on('load private chats', data=>{window.privateMessages=data;});
  socket.on('private message', msg=>{
    const key = [msg.user, msg.privateTo||''].sort().join('_');
    if(!window.privateMessages[key]) window.privateMessages[key]=[];
    window.privateMessages[key].push(msg);
    if(currentPrivate && [currentPrivate, username].sort().join('_')===key) addMessageToList(msg);
  });

  // Photo uploader
  photoInput.addEventListener('change',()=>{photoSendBtn.style.display='inline-block';});
  photoSendBtn.addEventListener('click',()=>{
    const file = photoInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload=()=>socket.emit('chat message',{user:username,msg:reader.result,type:'image',privateTo:currentPrivate});
    reader.readAsDataURL(file);
    photoInput.value=''; photoSendBtn.style.display='none';
  });

  // Fullscreen photo
  document.addEventListener('click', e=>{
    if(e.target.classList.contains('clickable-photo')){
      if(!document.fullscreenElement) e.target.requestFullscreen();
      else document.exitFullscreen();
    }
  });

  // Voice
  recordBtn.addEventListener('click', async ()=>{
    if(!username){alert('Log in om op te nemen'); return;}
    if(!mediaRecorder||mediaRecorder.state==='inactive'){
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      mediaRecorder=new MediaRecorder(stream); audioChunks=[];
      mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
      mediaRecorder.onstop=()=>{
        const blob=new Blob(audioChunks,{type:'audio/webm'}); const reader=new FileReader();
        reader.onload=()=>socket.emit('chat message',{user:username,msg:reader.result,type:'audio',privateTo:currentPrivate}); reader.readAsDataURL(blob);
      };
      mediaRecorder.start(); recordBtn.textContent='Stop opnemen';
    }else if(mediaRecorder.state==='recording'){mediaRecorder.stop(); recordBtn.textContent='🎤 Opnemen';}
  });

  // Friends
  function loadFriends(){
    fetch(`/getFriends/${username}`).then(res=>res.json()).then(data=>{
      friendsList.innerHTML=''; requestsContainer.innerHTML='';
      data.friends.forEach(f=>{
        const li=document.createElement('li'); li.textContent=f;
        const chatBtn=document.createElement('button'); chatBtn.textContent='💬'; chatBtn.onclick=()=>startPrivateChat(f);
        li.appendChild(chatBtn); friendsList.appendChild(li);
      });
      data.friendRequests.forEach(f=>{
        const div=document.createElement('div'); div.innerHTML=`Verzoek van ${f} `; 
        const accBtn=document.createElement('button'); accBtn.textContent='Accepteer'; accBtn.onclick=()=>respondRequest(f,true);
        const rejBtn=document.createElement('button'); rejBtn.textContent='Weiger'; rejBtn.onclick=()=>respondRequest(f,false);
        div.appendChild(accBtn); div.appendChild(rejBtn); requestsContainer.appendChild(div);
      });
    });
  }

  function startPrivateChat(friend){
    currentPrivate=friend; messagesList.innerHTML='';
    const key=[username,friend].sort().join('_');
    if(window.privateMessages[key]) window.privateMessages[key].forEach(addMessageToList);
  }

  function respondRequest(f,accept){fetch('/respondFriendRequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:f,to:username,accept})}).then(loadFriends);}
});
