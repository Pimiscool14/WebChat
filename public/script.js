document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";

  const modeBtn = document.getElementById('mode-toggle');
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');
  const chatSection = document.getElementById('chat-section');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');
  const photoInput = document.getElementById('photo-input');
  const recordBtn = document.getElementById('record-btn');

  const toggleFriendsBtn = document.getElementById('toggle-friends-btn');
  const friendsSection = document.getElementById('friends-section');
  const friendsList = document.getElementById('friends-list');
  const requestsList = document.getElementById('friend-requests');
  const addFriendInput = document.getElementById('add-friend-input');
  const addFriendBtn = document.getElementById('add-friend-btn');

  // Theme toggle
  try {
    modeBtn.style.display = 'none';
    const saved = localStorage.getItem('mode');
    if (saved === 'light') document.body.classList.add('light');

    modeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const now = document.body.classList.contains('light') ? 'light' : 'dark';
      localStorage.setItem('mode', now);
    });
  } catch (err) { console.error(err); }

  function stringToColor(str) {
    let hash = 0;
    for (let i=0;i<str.length;i++){hash = str.charCodeAt(i)+((hash<<5)-hash);}
    const color = Math.floor((Math.abs(Math.sin(hash)*16777215))%16777215);
    return "#" + ("000000" + color.toString(16)).slice(-6);
  }

  function formatMessage(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color:blue">${url}</a>`);
  }

  // Register
  registerForm.addEventListener('submit', async e=>{
    e.preventDefault();
    const res = await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      username: document.getElementById('reg-username').value,
      password: document.getElementById('reg-password').value
    })});
    const data = await res.json(); alert(data.message||data.error);
  });

  // Login
  loginForm.addEventListener('submit', async e=>{
    e.preventDefault();
    const logUser = document.getElementById('log-username').value;
    const logPass = document.getElementById('log-password').value;
    const res = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:logUser,password:logPass})});
    const data = await res.json();
    if(data.message){
      username = logUser;
      alert(data.message);
      loginForm.style.display='none'; registerForm.style.display='none'; chatSection.style.display='block'; modeBtn.style.display='inline-block';
      loadFriends();
    } else { alert(data.error); }
  });

  // Chat submit
  chatForm.addEventListener('submit', e=>{
    e.preventDefault();
    const text = messageInput.value.trim();
    if(!text) return;
    socket.emit('chat message',{user:username,msg:text,type:'text'});
    messageInput.value='';
  });

  messageInput.addEventListener('keypress', e=>{
    if(e.key==='Enter'){ e.preventDefault(); chatForm.dispatchEvent(new Event('submit')); }
  });

  // Photo upload
  photoInput.addEventListener('change', e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{socket.emit('chat message',{user:username,msg:reader.result,type:'image'});};
    reader.readAsDataURL(file);
  });

  // Messages render
  function addMessageToList(data){
    const li=document.createElement('li'); li.id=`msg-${data.id}`;
    const userSpan=document.createElement('span'); userSpan.textContent=data.user; userSpan.style.color=stringToColor(data.user); userSpan.style.fontWeight='bold'; userSpan.style.marginRight='6px';
    const msgSpan=document.createElement('span');
    if(data.type==='image'){msgSpan.innerHTML=`<img src="${data.msg}" alt="afbeelding">`;} else {msgSpan.innerHTML=formatMessage(data.msg);}
    const deleteBtn=document.createElement('button'); deleteBtn.textContent='🗑️'; deleteBtn.onclick=()=>socket.emit('delete message',data.id);
    li.appendChild(userSpan); li.appendChild(msgSpan); li.appendChild(deleteBtn); messagesList.appendChild(li); li.scrollIntoView({behavior:'smooth',block:'end'});
  }

  socket.on('chat history', msgs=>{ messagesList.innerHTML=''; msgs.forEach(addMessageToList); });
  socket.on('chat message', addMessageToList);
  socket.on('message deleted', id=>{ const li=document.getElementById(`msg-${id}`); if(li) li.remove(); });

  // Vrienden
  toggleFriendsBtn.onclick=()=>{ friendsSection.style.display=friendsSection.style.display==='none'?'block':'none'; };

  function loadFriends(){
    fetch(`/getFriends/${username}`).then(res=>res.json()).then(data=>{
      friendsList.innerHTML=''; requestsList.innerHTML='';
      data.friends.forEach(f=>{const li=document.createElement('li'); li.textContent=f; friendsList.appendChild(li);});
      data.friendRequests.forEach(f=>{
        const li=document.createElement('li'); li.textContent=f;
        const acceptBtn=document.createElement('button'); acceptBtn.textContent='Accepteer'; acceptBtn.onclick=()=>respondRequest(f,true);
        const rejectBtn=document.createElement('button'); rejectBtn.textContent='Weiger'; rejectBtn.onclick=()=>respondRequest(f,false);
        li.appendChild(acceptBtn); li.appendChild(rejectBtn); requestsList.appendChild(li);
      });
    });
  }

  function respondRequest(from,accept){ fetch('/respondFriendRequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from,to:username,accept})}).then(loadFriends); }

  addFriendBtn.onclick=()=>{ const to=addFriendInput.value.trim(); if(!to) return; fetch('/sendFriendRequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:username,to})}).then(res=>res.json()).then(data=>{alert(data.message||data.error); loadFriends();}); };

});
