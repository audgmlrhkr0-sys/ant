(function () {
  const ANT_IMGS = ['1.png', '2.png', '3.png'];
  const MIN_COUNT = 4;
  const MAX_COUNT = 8;
  const MAX_ALIVE = 10;
  const SPAWN_INTERVAL = 2000;
  const MOVE_INTERVAL = 55;
  const MIN_PERCENT = 12;
  const MAX_PERCENT = 88;
  const BG_REMOVE_TOLERANCE = 48;

  const antsEl = document.getElementById('ants');
  const startOverlay = document.getElementById('startOverlay');
  const startBtn = document.getElementById('startBtn');
  const gameFrame = document.getElementById('gameFrame');
  let aliveAnts = 0;
  let gameStarted = false;
  let spawnIntervalId = null;
  const cutoutCache = {};
  const antBgm = new Audio('ant.mp3');
  const popSnd = new Audio('pop.mp3');
  antBgm.loop = true;

  function randomBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function colorKey(r, g, b) {
    return (Math.round(r / 32) * 32) << 16 | (Math.round(g / 32) * 32) << 8 | (Math.round(b / 32) * 32);
  }

  function removeBackground(src, callback) {
    if (cutoutCache[src]) {
      callback(cutoutCache[src]);
      return;
    }
    const img = new Image();
    img.crossOrigin = '';
    const done = function (url) {
      try {
        if (url !== src) cutoutCache[src] = url;
      } catch (e) {}
      callback(url);
    };
    const timeout = setTimeout(function () { done(src); }, 3000);
    img.onload = function () {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;
        const samples = [
          [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
          [1, 0], [0, 1], [w - 2, 0], [0, h - 2], [w - 1, 1], [1, h - 1]
        ];
        const bgColors = [];
        const seen = new Set();
        for (const k = 0; k < samples.length; k++) {
          const px = samples[k][0], py = samples[k][1];
          const i = (py * w + px) * 4;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const key = colorKey(r, g, b);
          if (!seen.has(key)) {
            seen.add(key);
            bgColors.push([r, g, b]);
          }
        }
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          let match = false;
          for (let j = 0; j < bgColors.length; j++) {
            const br = bgColors[j][0], bg = bgColors[j][1], bb = bgColors[j][2];
            if (Math.abs(r - br) <= BG_REMOVE_TOLERANCE &&
                Math.abs(g - bg) <= BG_REMOVE_TOLERANCE &&
                Math.abs(b - bb) <= BG_REMOVE_TOLERANCE) {
              match = true;
              break;
            }
          }
          if (match) d[i + 3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        const out = canvas.toDataURL('image/png');
        clearTimeout(timeout);
        done(out);
      } catch (e) {
        clearTimeout(timeout);
        done(src);
      }
    };
    img.onerror = function () {
      clearTimeout(timeout);
      done(src);
    };
    img.src = src;
  }

  function createAnt(opts) {
    opts = opts || {};
    if (aliveAnts >= MAX_ALIVE) return;
    const src = ANT_IMGS[Math.floor(Math.random() * ANT_IMGS.length)];
    const ant = document.createElement('div');
    ant.className = 'ant';

    // 스프라이트마다 머리 방향 보정 (1번은 이미지의 아래쪽이 머리)
    let spriteOffset = 0; // 라디안
    if (src === '1.png') {
      spriteOffset = -Math.PI / 2; // 아래쪽 머리를 오른쪽 기준으로 맞추기
    }

    // 개미마다 크기 랜덤 (차이 더 크게: 0.4~1.65배)
    const baseSize = 40;
    const scale = randomBetween(0.4, 1.65);
    const minSize = typeof ontouchstart !== 'undefined' ? 36 : 22;
    const size = Math.max(minSize, Math.round(baseSize * scale));
    ant.style.width = size + 'px';
    ant.style.height = size + 'px';

    const img = new Image();
    img.className = 'ant-img';
    img.alt = '';

    let frameTimer = null;
    const altFrame =
      src === '1.png' ? '1-1.png' :
      src === '2.png' ? '2-1.png' :
      src === '3.png' ? '3-1.png' :
      null;
    const animated = !!altFrame;

    img.src = src;
    removeBackground(src, function (url0) {
      img.src = url0;
      if (!animated) return;
      removeBackground(altFrame, function (url1) {
        const frames = [url0, url1];
        let idx = 0;
        img.src = frames[idx];
        frameTimer = setInterval(function () {
          if (ant.classList.contains('squished')) return;
          idx = 1 - idx;
          img.src = frames[idx];
        }, 95);
      });
    });

    ant.appendChild(img);

    let x, y, angle, speed;
    if (opts.fromEdge) {
      const theta = randomBetween(0, Math.PI * 2);
      const r = 55;
      x = 50 + r * Math.cos(theta);
      y = 50 + r * Math.sin(theta);
      angle = theta + Math.PI;
      speed = randomBetween(0.28, 0.44);
    } else {
      x = randomBetween(MIN_PERCENT, MAX_PERCENT);
      y = randomBetween(MIN_PERCENT, MAX_PERCENT);
      angle = randomBetween(0, Math.PI * 2);
      speed = randomBetween(0.24, 0.42);
    }

    function setPosition() {
      ant.style.left = x + '%';
      ant.style.top = y + '%';
      const deg = (angle + spriteOffset + Math.PI) * (180 / Math.PI);
      ant.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    }

    const move = () => {
      if (ant.classList.contains('squished')) return;

      if (Math.random() < 0.06) {
        angle += randomBetween(-0.2, 0.2);
      }
      var vx = Math.cos(angle) * speed;
      var vy = Math.sin(angle) * speed;

      x += vx;
      y += vy;

      // 접시 가장자리에서 안쪽으로 들어올 때는 막지 않고, 안에서 밖으로 나가려 할 때만 반사
      if (x <= MIN_PERCENT && vx < 0) {
        angle = Math.PI - angle;
        x = MIN_PERCENT;
      }
      if (x >= MAX_PERCENT && vx > 0) {
        angle = Math.PI - angle;
        x = MAX_PERCENT;
      }
      if (y <= MIN_PERCENT && vy < 0) {
        angle = -angle;
        y = MIN_PERCENT;
      }
      if (y >= MAX_PERCENT && vy > 0) {
        angle = -angle;
        y = MAX_PERCENT;
      }
      setPosition();
    };

    let moveTimer = setInterval(move, MOVE_INTERVAL);

    ant.addEventListener('click', handleSquish);
    ant.addEventListener('touchend', handleSquish, { passive: false });

    function handleSquish(e) {
      if (e.type === 'touchend') e.preventDefault();
      if (ant.classList.contains('squished')) return;
      ant.classList.add('squished');
      clearInterval(moveTimer);
      if (frameTimer) clearInterval(frameTimer);
      ant.removeEventListener('click', handleSquish);
      ant.removeEventListener('touchend', handleSquish);
      try {
        popSnd.currentTime = 0;
        popSnd.play();
      } catch (err) {}
      setTimeout(() => {
        ant.remove();
        aliveAnts = Math.max(0, aliveAnts - 1);
        if (aliveAnts === 0) {
          try { antBgm.pause(); } catch (err) {}
        }
      }, 400);
    }

    setPosition();
    aliveAnts += 1;
    antsEl.appendChild(ant);
    if (aliveAnts >= 1) {
      try { antBgm.play(); } catch (err) {}
    }
  }

  function spawnLoop() {
    if (!gameStarted) return;
    const canSpawn = MAX_ALIVE - aliveAnts;
    if (canSpawn <= 0) return;
    const want = MIN_COUNT + Math.floor(Math.random() * (MAX_COUNT - MIN_COUNT + 1));
    const count = Math.min(canSpawn, want);
    for (let i = 0; i < count; i++) setTimeout(function () { createAnt(); }, i * 120);
  }

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    startOverlay.classList.remove('active');
    startOverlay.classList.add('hidden');
    gameFrame.classList.remove('blurred');
    for (let i = 0; i < 6; i++) {
      setTimeout(function () {
        createAnt({ fromEdge: true });
      }, i * 700);
    }
    setTimeout(function () {
      spawnIntervalId = setInterval(spawnLoop, SPAWN_INTERVAL);
    }, 6 * 700);
  }

  startBtn.addEventListener('click', startGame);
  startBtn.addEventListener('touchend', function (e) {
    e.preventDefault();
    startGame();
  }, { passive: false });

  var fullscreenBtn = document.getElementById('fullscreenBtn');
  var fullscreenIcon = document.getElementById('fullscreenIcon');
  if (fullscreenBtn && fullscreenIcon) {
    var doc = document;
    var docEl = doc.documentElement;
    var fullscreenEl = function () {
      return doc.fullscreenElement || doc.webkitFullscreenElement || null;
    };
    var requestFs = function () {
      if (docEl.requestFullscreen) return docEl.requestFullscreen();
      if (docEl.webkitRequestFullscreen) return docEl.webkitRequestFullscreen();
      if (docEl.webkitEnterFullscreen) return docEl.webkitEnterFullscreen();
      return Promise.reject(new Error('unsupported'));
    };
    var exitFs = function () {
      if (doc.exitFullscreen) return doc.exitFullscreen();
      if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
      return Promise.reject(new Error('unsupported'));
    };
    function updateFullscreenIcon() {
      var inFs = !!fullscreenEl();
      fullscreenIcon.textContent = inFs ? '\u229F' : '\u26F6';
      fullscreenBtn.classList.toggle('fullscreen', inFs);
    }
    function toggleFullscreen() {
      var inRealFs = !!fullscreenEl();
      var inPseudo = doc.body.classList.contains('pseudo-fullscreen');
      if (inRealFs) {
        exitFs().then(updateFullscreenIcon).catch(function () {});
      } else if (inPseudo) {
        doc.body.classList.remove('pseudo-fullscreen');
        fullscreenBtn.classList.remove('fullscreen');
        fullscreenIcon.textContent = '\u26F6';
      } else {
        requestFs().then(updateFullscreenIcon).catch(function () {
          doc.body.classList.add('pseudo-fullscreen');
          fullscreenBtn.classList.add('fullscreen');
          fullscreenIcon.textContent = '\u229F';
        });
      }
    }
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    fullscreenBtn.addEventListener('touchend', function (e) {
      e.preventDefault();
      toggleFullscreen();
    }, { passive: false });
    doc.addEventListener('fullscreenchange', updateFullscreenIcon);
    doc.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
  }
})();
