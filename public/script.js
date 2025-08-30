// script.js - compleet en betrouwbaar (DOMContentLoaded + theme toggle + chat + uploads + opname)

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let username = "";

  // DOM elementen
  const modeBtn = document.getElementById('mode-toggle');
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');
  const chatSection = document.getElementById('chat-section');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message');
  const messagesList = document.getElementById('messages');
  const photoInput = document.getElementById('photo-input');
  const recordBtn = document.getElementById('record-btn');

  // ------- Theme toggle -------
  try {
    modeBtn.style.display = 'none'; // toon pas na login
    const saved = localStorage.getItem('mode');
    if (saved === 'light') document.body.classList.add('light');

    modeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const now = document.body.classList.contains('light') ? 'light' : 'dark';
      localStorage.setItem('mode', now);
      console.log('Theme switched to:', now);
    });
  } catch (err) {
    console.error('Theme toggle init error:', err);
  }

  // ------- kleur per gebruiker -------
  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.floor((Math.abs(Math.sin(hash) * 16777215)) % 16777215);
    return "#" + ("000000" + color.toString(16)).slice(-6);
  }

  // ------- format message (links, video, images, audio, tiktok) -------
  function formatMessage(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      let embed = "";

      // YouTube
      if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/")) {
        let videoId = url.includes("youtube.com") ? (new URL(url).searchParams.get('v')) : url.split('/').pop();
        if (videoId) embed = `<br><iframe width="300" height="169" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
      }
      // Vimeo
      else if (url.includes("vimeo.com/")) {
        const vid = url.split('vimeo.com/')[1];
        if (vid) embed = `<br><iframe src="https://player.vimeo.com/video/${vid}" width="300" height="169" frameborder="0" allowfullscreen></iframe>`;
      }
      // direct video file
      else if (url.match(/\.(mp4|webm|ogg)$/i)) {
        embed = `<br><video width="300" controls><source src="${url}">Je browser ondersteunt geen video-tag.</video>`;
      }
      // audio file
      else if (url.match(/\.(mp3|wav|ogg)$/i)) {
        embed = `<br><audio controls><source src="${url}">Je browser ondersteunt geen audio-tag.</audio>`;
      }
      // image file
      else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        embed = `<br><img src="${url}" alt="afbeelding">`;
      }
      // tiktok
      else if (url.includes('tiktok.com')) {
        embed = `<br><blockquote class="tiktok-embed" cite="${url}" style="max-width:300px;min-width:300px;"><a href="${url}">Bekijk TikTok</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script>`;
      }

      return `<a href="${url}" target="_blank" style="color:blue">${url}</a>${embed}`;
    });
  }

  // ------- Register -------
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          username: document.getElementById('reg-username').value,
          password: document.getElementById('reg-password').value
        })
      });
      const data = await res.json();
      alert(data.message || data.error);
    } catch (err) {
      alert('Fout bij registeren: ' + err.message);
    }
  });

  // ------- Login -------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const logUser = document.getElementById('log-username').value;
      const logPass = document.getElementById('log-password').value;
      const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ username: logUser, password: logPass })
      });
      const data = await res.json();
      if (data.message) {
        username = logUser;
        alert(data.message);
        // UI aanpassen
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        chatSection.style.display = 'block';
        modeBtn.style.display = 'inline-block';
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Fout bij inloggen: ' + err.message);
    }
  });

  // ------- Chat submit -------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!username) { alert('Log eerst in'); return; }
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit('chat message', { user: username, msg: text, type: 'text' });
    messageInput.value = '';
  });

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // ------- Photo upload (local file -> DataURL) -------
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // verstuur base64 data als image
      socket.emit('chat message', { user: username, msg: reader.result, type: 'image' });
    };
    reader.readAsDataURL(file);
  });

  // ------- Voice recording -------
  let mediaRecorder, audioChunks = [];
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
            socket.emit('chat message', { user: username, msg: reader.result, type: 'audio' });
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        recordBtn.textContent = 'Stop opnemen';
      } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.textContent = 'Record';
      }
    } catch (err) {
      alert('Opname fout: ' + err.message);
    }
  });

  // ------- Messages ontvangen -------
  socket.on('chat message', (data) => {
    const li = document.createElement('li');

    const userSpan = document.createElement('span');
    userSpan.textContent = data.user;
    userSpan.style.color = stringToColor(data.user);
    userSpan.style.fontWeight = 'bold';
    userSpan.style.marginRight = '6px';

    const msgSpan = document.createElement('span');

    // Als type is image/audio, msg bevat DataURL of externe URL
    if (data.type === 'image') {
      if (data.msg.startsWith('data:')) {
        msgSpan.innerHTML = `<img src="${data.msg}" alt="afbeelding">`;
      } else {
        msgSpan.innerHTML = formatMessage(data.msg);
      }
    } else if (data.type === 'audio') {
      msgSpan.innerHTML = `<audio controls src="${data.msg}"></audio>`;
    } else {
      msgSpan.innerHTML = formatMessage(data.msg);
    }

    li.appendChild(userSpan);
    li.appendChild(msgSpan);
    messagesList.appendChild(li);
    li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  // Safety: log Socket errors
  socket.on('connect_error', (err) => console.error('Socket connect_error:', err));
  socket.on('error', (err) => console.error('Socket error:', err));
});
