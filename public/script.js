const avatarMap = JSON.parse(localStorage.getItem('duckAvatars') || '{}');

// —— 2) DOM refs: Setup drawer & wizard ——
const drawer         = document.getElementById('setupDrawer');
const drawerToggle   = document.getElementById('drawerToggle');
const setupForm      = document.getElementById('setupForm');
const namesInput     = document.getElementById('namesInput');
const durationInput  = document.getElementById('durationInput');
const targetInput    = document.getElementById('targetInput');
const winnersCountInput = document.getElementById('winnersCountInput');
const randomnessInput   = document.getElementById('randomnessInput');
const randomnessValue   = document.getElementById('randomnessValue');
const btnNext        = document.getElementById('btnNext');
const btnBack        = document.getElementById('btnBack');
const avatarGrid     = document.getElementById('avatarGrid');

// —— 3) DOM refs: Race UI ——
const winnerListEl   = document.getElementById('winnerList');
const raceContainer  = document.getElementById('raceContainer');
const trackEl        = document.getElementById('track');
const sidebarTimerEl = document.getElementById('sidebarTimer');
const scoreboardTbody= document.querySelector('#scoreboard tbody');
const pauseBtn       = document.getElementById('pauseBtn');
const resetBtn       = document.getElementById('resetBtn');
const roundCounterEl = document.getElementById('roundCounter');

// —— 4) Audio elements ——
const ambWater   = document.getElementById('amb-water');
const sndWhistle = document.getElementById('snd-whistle');
const sndPing    = document.getElementById('snd-ping');
const sndCheer   = document.getElementById('snd-cheer');
const sndClick   = document.getElementById('snd-click');

// —— 5) Global state ——
let allDucks        = [];
let activeDucks     = [];
let targetScore, raceDuration;
let winnersCount    = 1, winners = [];
let randomness      = parseFloat(randomnessInput.value);
let seriesRunning   = false;
let isPaused        = false;
let pauseResolve    = null;

// —— Timer state ——
let timerInterval      = null;
let heatStartTime      = 0;
let elapsedBeforePause = 0;

// —— Round counter ——
let roundCount = 0;
function updateRoundCounter() {
  if (roundCounterEl) {
    roundCounterEl.textContent = `Round ${roundCount}`;
  }
}

// —— Drawer helpers ——
function openDrawer() {
  drawer.classList.add('open');
  drawer.classList.remove('closed');
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.classList.add('closed');
}

// clicking the “Close” button in the drawer
document.querySelectorAll('.drawerToggle')
  .forEach(btn => btn.addEventListener('click', closeDrawer));

// then, after all functions are defined, **immediately open** the drawer:
window.addEventListener('DOMContentLoaded', () => {
  roundCounterEl = document.getElementById('roundCounter');
  updateRoundCounter(); 
  openDrawer();
});

// —— 6) Ambient autoplay hack ——
ambWater.muted    = true;
ambWater.loop     = true;
ambWater.autoplay = true;
ambWater.play().catch(() => {});
window.addEventListener('load', () => {
  ambWater.muted  = false;
  ambWater.volume = 0.1;
});

// —— 7) Randomness slider UI ——
randomnessValue.textContent = randomness.toFixed(2);
randomnessInput.addEventListener('input', () => {
  randomness = parseFloat(randomnessInput.value);
  randomnessValue.textContent = randomness.toFixed(2);
});

// —— 8) Wizard nav (Step 1 ↔ 2) ——
let currentStep = 1;
function showStep(n) {
  document.querySelectorAll('.wizard-step').forEach(el =>
    el.classList.toggle('hidden', el.dataset.step != n)
  );
  document.querySelectorAll('.wizard-steps .step').forEach(el =>
    el.classList.toggle('active', el.dataset.step == n)
  );

  // toggle Back button
  btnBack.classList.toggle('hidden', n === 1);

  // update Next button label
  if (n === 1) {
    btnNext.textContent = 'Next →';
  } else {
    btnNext.textContent = 'Start Race';
  }

  currentStep = n;
}
btnNext.addEventListener('click', () => {
  sndClick.play();
  ambWater.play().catch(() => {});
  if (currentStep === 1) {
    const names = namesInput.value.split(',').map(s => s.trim()).filter(Boolean);
    avatarGrid.innerHTML = '';
    names.forEach(name => {
      // build avatar-selection cards (unchanged)…
      const card = document.createElement('div');
      card.className = 'avatar-card';
      card.innerHTML = `
        <div class="avatar-name">${name}</div>
        <img class="duck-avatar-preview" src="${avatarMap[name]||'assets/duck.png'}">
        <label class="upload-btn">
          Upload avatar
          <input type="file" class="avatarInput" accept="image/*,.webp">
        </label>
        <button type="button" class="reset-avatar">Restore default</button>
      `;
      const fileIn  = card.querySelector('.avatarInput');
      const preview = card.querySelector('.duck-avatar-preview');
      fileIn.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        const blob = URL.createObjectURL(file);
        preview.src = blob;
        const form = new FormData(); form.append('avatar', file);
        const res  = await fetch('/upload-avatar',{method:'POST',body:form});
        const { url } = await res.json();
        preview.src = url;
        avatarMap[name] = url;
        localStorage.setItem('duckAvatars', JSON.stringify(avatarMap));
        URL.revokeObjectURL(blob);
      });
      card.querySelector('.reset-avatar').addEventListener('click', () => {
        preview.src = 'assets/duck.png';
        delete avatarMap[name];
        localStorage.setItem('duckAvatars', JSON.stringify(avatarMap));
        fileIn.value = '';
      });
      avatarGrid.appendChild(card);
    });
    showStep(2);
  } else {
    setupForm.requestSubmit();
  }
});
btnBack.addEventListener('click', () => { if (currentStep === 2) showStep(1); });
showStep(1);

// —— 9) Pause / Resume ——
pauseBtn.addEventListener('click', () => {
  sndClick.play();
  if (!seriesRunning) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  [ambWater, sndWhistle, sndPing, sndCheer].forEach(a => {
    if (a) isPaused ? a.pause() : a.play().catch(() => {});
  });
  if (isPaused) {
    elapsedBeforePause += performance.now() - heatStartTime;
    clearInterval(timerInterval);
    activeDucks.forEach(d => d.anim && d.anim.pause());
  } else {
    startHeatTimer();
    if (pauseResolve) pauseResolve();
    activeDucks.forEach(d => d.anim && d.anim.play());
  }
});
function waitIfPaused() {
  return isPaused ? new Promise(r => (pauseResolve = r)) : Promise.resolve();
}

// —— 10) Timer helpers ——
function startHeatTimer() {
  heatStartTime = performance.now();
  clearInterval(timerInterval);
  sidebarTimerEl.textContent = (elapsedBeforePause / 1000).toFixed(2) + 's';
  timerInterval = setInterval(() => {
    const total = elapsedBeforePause + (performance.now() - heatStartTime);
    sidebarTimerEl.textContent = (total / 1000).toFixed(2) + 's';
  }, 16);
}
function stopHeatTimer() { clearInterval(timerInterval); }

// —— 11) Setup & start series ——
setupForm.addEventListener('submit', e => {
  e.preventDefault();
  sndClick.play();

  // parse inputs…
  const names        = namesInput.value.split(',').map(s => s.trim()).filter(Boolean);
  targetScore        = +targetInput.value;
  raceDuration       = +durationInput.value;
  winnersCount       = Math.max(1, +winnersCountInput.value);
  randomness         = parseFloat(randomnessInput.value);
  winners            = [];
  elapsedBeforePause = 0;

  if (!names.length || targetScore < 1 || raceDuration <= 0) {
    return alert('Please enter valid inputs.');
  }

  allDucks     = names.map(n => ({name:n,score:0,container:null,anim:null}));
  activeDucks  = [...allDucks];

  // reset round counter & show it
  roundCount = 0;
  updateRoundCounter();

  // build track
  trackEl.innerHTML = '';
  activeDucks.forEach((d, i) => {
    // 1) inject the HTML
    const av = avatarMap[d.name] || 'assets/duck.png';
    trackEl.insertAdjacentHTML('beforeend', `
      <div class="duck-container" id="duck-${i}">
        <div class="duck-label">${d.name}</div>
        <img class="duck-img" src="${av}">
      </div>`);
    // 2) grab the fresh element
    const container = document.getElementById(`duck-${i}`);
    d.container = container;

    // 3) compute vertical spacing
    const trackH    = trackEl.clientHeight;
    const duckH     = container.getBoundingClientRect().height;
    const available = trackH - duckH;
    const y = activeDucks.length > 1
      ? (i / (activeDucks.length - 1)) * available
      : available / 2;

    // 4) position it
    container.style.top = `${y}px`;
  });

  // vertical spacing
  const H = trackEl.clientHeight,
        D = 150,
        maxY = H - D;
  activeDucks.forEach((d, i) => {
    const y = activeDucks.length > 1
      ? (i / (activeDucks.length - 1)) * maxY
      : maxY / 2;
    d.container.style.setProperty('--duck-y', `${y}px`);
  });

    if (!namesInput.value.trim()) {
    return alert('Please enter at least one duck name.');
  }
  if (durationInput.value <= 0) {
    return alert('Please set a positive race duration.');
  }

  closeDrawer();

  // show UI
  raceContainer.hidden = false;
  resetBtn.style.display = 'block';
  pauseBtn.textContent   = 'Pause';
  isPaused         = false;
  seriesRunning    = true;
  sidebarTimerEl.textContent = '0.00s';

  roundCount = 0;
  updateRoundCounter();
  renderScoreboard();
  nextHeat();
});

// ——————————————————————————————————————
// 12) Reset one heat instantly
// ——————————————————————————————————————
function resetHeat() {
  activeDucks.forEach(d => {
    if (d.anim) d.anim.cancel(), d.anim = null;
    d.container.style.left = '0px';
  });
  void trackEl.offsetWidth; // force reflow
  elapsedBeforePause = 0;
}

// ——————————————————————————————————————
// 13) Main loop: random speeds, true first-to-finish, then reset
// ——————————————————————————————————————
async function nextHeat() {
  if (!seriesRunning) return;
  await waitIfPaused();

  roundCount++;
  updateRoundCounter();

  // sound, timer reset
  sndWhistle.play();
  elapsedBeforePause = 0;

  // finish-line X
  const W       = trackEl.clientWidth;
  const fw      = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--finish-width')
  );
  const finishX = W - fw;

  // randomized durations ≥ raceDuration
  const durations = activeDucks.map(() =>
    raceDuration * (1 + randomness * Math.random())
  );

  // pick the true winner (min duration)
  let winnerIdx = 0;
  durations.forEach((d,i) => {
    if (d < durations[winnerIdx]) winnerIdx = i;
  });

  // snap everyone back & start timer
  resetHeat();
  startHeatTimer();

  // chaos keyframes for each duck
  activeDucks.forEach((d,i) => {
    const isWin = i === winnerIdx;
    const durMs = durations[i] * 1000;

    // build a random series of mid-points (3–5)
    const steps = [];
    const numSteps = 3 + Math.floor(Math.random()*3); // 3–5 segments
    for (let s = 0; s < numSteps; s++) {
      const offset = (s+1)/(numSteps+1);
      const xOff   = finishX * (offset * (isWin ? 1 : 0.7 + Math.random()*0.3));
      const yJolt  = (Math.random()*2 - 1) * 30;    // ±30px vertical chaos
      const scale  = 0.9 + Math.random()*0.3;       // 0.9–1.2 scale
      const rot    = (Math.random()*2 - 1)*30;      // ±30° tilt
      steps.push({
        left: `${xOff}px`,
        transform: `translateY(${yJolt}px) scale(${scale}) rotate(${rot}deg)`,
        offset
      });
    }

    // final keyframe
    const finalX = isWin ? finishX : finishX * (0.7 + Math.random()*0.2);
    steps.push({
      left:  `${finalX}px`,
      transform: 'translateY(0px) scale(1) rotate(0deg)',
      offset: 1
    });

    // prepend the 0% keyframe
    const keyframes = [
      { left:'0px', transform:'translateY(0) scale(1) rotate(0)', offset:0 },
      ...steps
    ];

    d.anim = d.container.animate(keyframes, {
      duration: durMs,
      easing: 'cubic-bezier(.6,0,.4,1)',
      fill: 'forwards'
    });
  });

  // listen for real first-to-finish
  const winner = activeDucks[winnerIdx];
  winner.anim.onfinish = () => {
    stopHeatTimer();
    sndPing.play();

    // freeze others in place
    activeDucks.forEach((d,i) => {
      if (i !== winnerIdx && d.anim) d.anim.cancel();
    });

    // award & remove if needed
    winner.score++;
    renderScoreboard();
    if (winner.score >= targetScore) {
      winners.push({ name: winner.name });
      activeDucks = activeDucks.filter((_,i) => i !== winnerIdx);
    }

    // short pause, then reset or finish
    setTimeout(() => {
      resetHeat();
      if (winners.length < winnersCount) {
        nextHeat();
      } else {
        seriesRunning = false;
        sndCheer.currentTime = 0;
        sndCheer.play();
        confetti
          .create(document.getElementById('confetti-canvas'), { resize: true, useWorker: true })
          ({ particleCount: 300, spread: 100, origin: { y: 0.3 } });
        winnerListEl.innerHTML = winners
          .map((w,i) => {
            const medal = ['🥇','🥈','🥉'][i] || '🏅';
            return `<li><span class="medal">${medal}</span> ${w.name}</li>`;
          }).join('');
        document.getElementById('winnerBanner').classList.remove('hidden');
      }
    }, 500);
  };
}



// ——————————————————————————————————————
// 14) Scoreboard render
// ——————————————————————————————————————
function renderScoreboard() {
  const sorted = [...allDucks].sort((a, b) => b.score - a.score);
  scoreboardTbody.innerHTML = sorted
    .map(d => `<tr><td>${d.name}</td><td>${d.score}</td></tr>`)
    .join('');
}

// ——————————————————————————————————————
// 15) Reset entire simulation
// ——————————————————————————————————————
resetBtn.addEventListener('click', () => {
  sndClick.play();
  seriesRunning = false;
  activeDucks.forEach(d => d.anim && d.anim.cancel());
  [sndWhistle, sndPing, sndCheer, ambWater].forEach(a => {
    if (a) { a.pause(); a.currentTime = 0; }
  });
  setupForm.reset();
  setupForm.hidden     = false;
  raceContainer.hidden = true;
  openDrawer();
  raceContainer.hidden = true;
});

// ——————————————————————————————————————
// 16) Close winner banner
// ——————————————————————————————————————
document.getElementById('closeBanner').addEventListener('click', () => {
  document.getElementById('winnerBanner').classList.add('hidden');
});


// at the top, after you define openDrawer():
const openSettingsBtn = document.getElementById('openSettingsBtn');
openSettingsBtn.addEventListener('click', () => {
  if (drawer.classList.contains('open')) {
    closeDrawer();
  } else {
    openDrawer();
  }
});

// And in your “New Simulation” handler, you probably already have:
resetBtn.addEventListener('click', () => {
  sndClick.play();
  seriesRunning = false;
  // … cancel animations …
  openDrawer();            // slide the setup form back down
  raceContainer.hidden = true;
  // … reset form & scoreboard …
});


// --- backgrounds slideshow ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

const bgEl = document.getElementById('bg');
let bgImages = [], bgIdx = 0;

// fetch the list of files from the server
fetch('/backgrounds')
  .then(res => res.json())
  .then(list => {
    if (!list.length) return;
    bgImages = list;
    shuffle(bgImages);

    // show first image immediately
    bgEl.style.backgroundImage = `url(${bgImages[0]})`;

    // every 10s: fade out, swap, fade in
    setInterval(() => {
      bgEl.classList.add('hidden');      // fade out over 2s
      setTimeout(() => {
        bgIdx = (bgIdx + 1) % bgImages.length;
        bgEl.style.backgroundImage = `url(${bgImages[bgIdx]})`;
        bgEl.classList.remove('hidden'); // fade in
      }, 2000);   // matches your CSS transition-duration
    }, 10000);    // total hold time before next fade
  })
  .catch(err => console.error('Could not load backgrounds', err));
