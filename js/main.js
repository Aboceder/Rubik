(function () {
  const { FACES, parseAlg, tokenAngle, describe } = window.RubikNotation;
  const {
    createSolvedState,
    cloneState,
    applyTokens,
    toLocalState,
    findCubie,
    isSolved,
  } = window.RubikState;
  const { CASES, GROUPS } = window.RubikF2L;
  const { renderCases } = window.RubikThumbnails;
  const CubeView = window.RubikCubeView;
  const dialog = window.RubikDialog;

  const canvas = document.getElementById('stage');
  const view = new CubeView(canvas, { interactive: true });
  let state = createSolvedState();
  view.setState(state);

  let chain = Promise.resolve();
  let animating = false;
  let inverse = false;
  let history = [];
  let moveCount = 0;

  const logEl = document.getElementById('log');
  const logEmptyEl = document.getElementById('logEmpty');
  const moveCountEl = document.getElementById('moveCount');
  const stateBadge = document.getElementById('stateBadge');
  const stateText = document.getElementById('stateText');
  const undoBtn = document.getElementById('undo');
  const dirCW = document.getElementById('dirCW');
  const dirCCW = document.getElementById('dirCCW');
  const lookButton = document.getElementById('lookBottom');
  const modePlayBtn = document.getElementById('modePlay');
  const modeF2LBtn = document.getElementById('modeF2L');
  const workspacePlay = document.getElementById('workspacePlay');
  const workspaceF2L = document.getElementById('workspaceF2L');

  function renderLog() {
    logEl.innerHTML = '';
    const shown = history.slice(-24);
    shown.forEach((move, index) => {
      const chip = document.createElement('span');
      chip.textContent = move.label;
      if (index === shown.length - 1) chip.className = 'is-last';
      logEl.appendChild(chip);
    });
    logEmptyEl.hidden = history.length > 0;
  }

  function refreshStatus() {
    moveCountEl.textContent = moveCount;
    undoBtn.disabled = history.length === 0;
    const solved = isSolved(state);
    stateText.textContent = solved ? '已复原' : '已打乱';
    stateBadge.classList.toggle('is-solved', solved);
    stateBadge.classList.toggle('is-scrambled', !solved);
  }

  function syncView() {
    view.setState(state);
  }

  async function runMove(move) {
    animating = true;
    if (move.rotation) {
      await view.animateTurn(move.axis, [-1, 0, 1], move.angle, move.duration);
    } else {
      await view.animateTurn(move.axis, move.layers, move.angle, move.duration);
    }
    const result = applyTokens(state, [
      {
        base: move.base,
        amount: move.amount,
        axis: move.axis,
        layers: move.layers,
        all: move.rotation,
      },
    ]);
    state = result.state;
    syncView();
    animating = false;
    if (!move.silent) {
      history.push({ label: move.label, token: move });
      moveCount += 1;
      renderLog();
    }
    refreshStatus();
  }

  function queueMove(move) {
    chain = chain.then(() => runMove(move));
    return chain;
  }

  function queueToken(token, options) {
    const opts = options || {};
    return queueMove({
      base: token.base,
      amount: token.amount,
      axis: token.axis,
      layers: token.layers,
      rotation: token.all,
      angle: tokenAngle(token),
      label: token.label,
      silent: opts.silent,
      duration: opts.duration,
    });
  }

  function enqueueFaceTurn(faceKey, backwards, opts) {
    const options = opts || {};
    const face = FACES[faceKey];
    const amount = backwards ? -1 : 1;
    queueMove({
      base: faceKey,
      amount,
      axis: face.axis.slice(),
      layers: [1],
      rotation: false,
      angle: (-amount * Math.PI) / 2,
      label: faceKey + (backwards ? "'" : ''),
      silent: options.silent,
      duration: options.duration,
    });
  }

  function setDirection(backwards) {
    inverse = backwards;
    dirCW.className = backwards ? 'btn join-item btn-xs' : 'btn join-item btn-xs btn-neutral';
    dirCCW.className = backwards ? 'btn join-item btn-xs btn-neutral' : 'btn join-item btn-xs';
    dirCW.setAttribute('aria-pressed', String(!backwards));
    dirCCW.setAttribute('aria-pressed', String(backwards));
  }

  dirCW.addEventListener('click', () => setDirection(false));
  dirCCW.addEventListener('click', () => setDirection(true));

  document.querySelectorAll('.net-btn').forEach((button) => {
    button.addEventListener('click', () => enqueueFaceTurn(button.dataset.face, inverse));
  });

  window.addEventListener('keydown', (event) => {
    if (dialog.isOpen()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, select, textarea')) return;
    const key = event.key.toUpperCase();
    if (FACES[key]) {
      event.preventDefault();
      enqueueFaceTurn(key, event.shiftKey);
      return;
    }
    if (event.key === ' ') event.preventDefault();
  });

  document.getElementById('scramble').addEventListener('click', () => {
    if (animating) return;
    const keys = Object.keys(FACES);
    let last = '';
    for (let i = 0; i < 22; i++) {
      let key;
      do {
        key = keys[Math.floor(Math.random() * keys.length)];
      } while (key === last);
      last = key;
      enqueueFaceTurn(key, Math.random() < 0.5, {
        silent: true,
        duration: view.reduceMotion ? 1 : 80,
      });
    }
    chain = chain.then(() => {
      history = [];
      moveCount = 0;
      renderLog();
      refreshStatus();
    });
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (animating) return;
    chain = chain.then(() => {
      state = createSolvedState();
      syncView();
      history = [];
      moveCount = 0;
      renderLog();
      refreshStatus();
    });
  });

  document.getElementById('undo').addEventListener('click', () => {
    if (animating || !history.length) return;
    const last = history.pop();
    moveCount = Math.max(0, moveCount - 1);
    queueToken(
      {
        ...last.token,
        amount: -last.token.amount,
        label: last.token.label,
      },
      { silent: true },
    );
    renderLog();
  });

  lookButton.addEventListener('click', () => {
    const nowBelow = view.lookBelow();
    lookButton.textContent = nowBelow ? '回到俯视' : '转到下方看绿面';
  });

  function setWorkspace(next) {
    const isF2L = next === 'f2l';
    workspacePlay.classList.toggle('hidden', isF2L);
    workspaceF2L.classList.toggle('hidden', !isF2L);
    modePlayBtn.classList.toggle('is-active', !isF2L);
    modeF2LBtn.classList.toggle('is-active', isF2L);
    modePlayBtn.setAttribute('aria-pressed', String(!isF2L));
    modeF2LBtn.setAttribute('aria-pressed', String(isF2L));
    if (isF2L) {
      history.replaceState(null, '', '#f2l');
      view.setInteractive(false);
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      view.setInteractive(true);
      view.resize();
    }
  }

  modePlayBtn.addEventListener('click', () => setWorkspace('play'));
  modeF2LBtn.addEventListener('click', () => setWorkspace('f2l'));
  document.getElementById('openF2L').addEventListener('click', () => {
    setWorkspace('f2l');
    window.scrollTo({ top: 0, behavior: view.reduceMotion ? 'auto' : 'smooth' });
  });

  let drag = null;
  let suppressOrbit = false;
  const AXES = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  function resolveDrag(dx, dy) {
    const normal = drag.normal;
    const dragVector = { x: dx, y: dy };
    const length = Math.hypot(dx, dy);
    if (length < 1) return null;
    dragVector.x /= length;
    dragVector.y /= length;
    let best = null;
    for (const tangent of AXES) {
      if (Math.abs(tangent[0] * normal.x + tangent[1] * normal.y + tangent[2] * normal.z) > 0.5) {
        continue;
      }
      const direction = new window.THREE.Vector3(tangent[0], tangent[1], tangent[2]);
      const screen = view.screenDelta(drag.point, direction);
      if (screen.lengthSq() < 1e-6) continue;
      screen.normalize();
      const dot = screen.x * dragVector.x + screen.y * dragVector.y;
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { tangent, dot };
    }
    if (!best || Math.abs(best.dot) < 0.25) return null;

    const sign = Math.sign(best.dot);
    const axis = new window.THREE.Vector3(
      best.tangent[0],
      best.tangent[1],
      best.tangent[2],
    )
      .cross(normal)
      .round();
    const axisArray = [axis.x, axis.y, axis.z];
    const angle = -sign * (Math.PI / 2);
    const layer = Math.round(
      drag.cubie.pos[0] * axisArray[0] +
        drag.cubie.pos[1] * axisArray[1] +
        drag.cubie.pos[2] * axisArray[2],
    );
    const amount = angle < 0 ? 1 : -1;
    return {
      base: describe(axisArray, layer, angle),
      amount,
      axis: axisArray,
      layers: [layer],
      rotation: false,
      angle,
      label: describe(axisArray, layer, angle),
    };
  }

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (animating || dialog.isOpen()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const hit = view.pick(event.clientX, event.clientY);
      if (!hit) return;
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cubie: hit.cubie,
        normal: hit.normal,
        point: hit.point,
      };
      suppressOrbit = true;
      view.controls.enabled = false;
      canvas.classList.add('grabbing');
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    true,
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 11) return;
      const move = resolveDrag(dx, dy);
      drag = null;
      if (move) queueMove(move);
    },
    true,
  );

  function endDrag(event) {
    if (drag && event.pointerId === drag.id) drag = null;
    canvas.classList.remove('grabbing');
    if (suppressOrbit) {
      suppressOrbit = false;
      view.controls.enabled = true;
    }
  }

  canvas.addEventListener('pointerup', endDrag, true);
  canvas.addEventListener('pointercancel', endDrag, true);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  const listEl = document.getElementById('f2lList');
  const emptyEl = document.getElementById('f2lEmpty');
  const countEl = document.getElementById('f2lCount');
  const doneEl = document.getElementById('f2lDone');
  let activeGroup = 'all';
  let thumbnails = new Map();
  const doneCases = new Set();

  function renderCaseList() {
    listEl.innerHTML = '';
    const filtered =
      activeGroup === 'all'
        ? CASES
        : CASES.filter((item) => item.group === activeGroup);
    countEl.textContent = filtered.length + ' / ' + CASES.length;
    emptyEl.hidden = filtered.length > 0;

    for (const item of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'case-card group flex min-h-[154px] flex-col p-2.5 text-left';
    button.setAttribute('aria-label', 'F2L ' + item.n + '：' + item.teach.look);
      button.dataset.case = String(item.n);

      const art = document.createElement('div');
      art.className = 'case-visual mx-auto flex aspect-square w-full max-w-[132px] items-center justify-center overflow-hidden rounded-[12px]';
      const image = document.createElement('img');
      image.className = 'h-full w-full object-contain';
      image.src = thumbnails.get(item.n);
      image.alt = '';
      image.decoding = 'async';
      art.appendChild(image);

      const foot = document.createElement('div');
      foot.className = 'mt-auto flex w-full items-center justify-between gap-2 px-0.5 pt-2';
      const name = document.createElement('span');
      name.className = 'rounded-full bg-[var(--color-neutral)] px-2 py-1 font-mono text-[9px] tracking-wider text-[var(--color-neutral-content)]';
      name.textContent = 'CASE ' + String(item.n).padStart(2, '0');
      const group = document.createElement('span');
      group.className =
        'rounded-full bg-[var(--color-base-200)] px-2 py-1 text-[9.5px] font-semibold text-[var(--ink-soft)]';
      group.textContent = GROUPS[item.group];
      foot.append(name, group);

      const done = document.createElement('span');
      done.className = 'case-done';
      done.hidden = !doneCases.has(item.n);
      done.setAttribute('aria-hidden', 'true');
      done.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';

      const alg = document.createElement('p');
      alg.className = 'mono mt-1 line-clamp-1 px-0.5 text-[10.5px] tracking-wide text-[var(--ink-soft)]';
      alg.textContent = item.alg;

      const prompt = document.createElement('p');
      prompt.className =
        'mt-1.5 line-clamp-2 px-0.5 text-[10.5px] leading-[1.55] text-[var(--ink-soft)]';
      prompt.textContent = item.teach.goal;
      button.append(done, art, alg, prompt, foot);
      button.addEventListener('click', () => dialog.open(item));
      listEl.appendChild(button);
    }
  }

  document.querySelectorAll('#f2lTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#f2lTabs .filter-tab').forEach((item) => {
        item.classList.remove('is-active');
        item.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      activeGroup = tab.dataset.group;
      renderCaseList();
    });
  });

  document.getElementById('f2lRandom').addEventListener('click', () => {
    const pool =
      activeGroup === 'all'
        ? CASES
        : CASES.filter((item) => item.group === activeGroup);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    dialog.open(pick);
  });

  document.querySelector('.f2l-guide summary')?.addEventListener('click', (event) => {
    if (event.detail > 0) event.currentTarget.blur();
  });

  window.addEventListener('f2l-complete', (event) => {
    doneCases.add(event.detail.caseNumber);
    doneEl.textContent = '已练 ' + doneCases.size;
    doneEl.classList.toggle('hidden', doneCases.size === 0);
    const card = listEl.querySelector('[data-case="' + event.detail.caseNumber + '"]');
    const badge = card?.querySelector('.case-done');
    if (badge) badge.hidden = false;
  });

  renderLog();
  refreshStatus();
  thumbnails = renderCases(CASES);
  for (const [group, count] of Object.entries(
    CASES.reduce((acc, item) => {
      acc[item.group] = (acc[item.group] || 0) + 1;
      return acc;
    }, {}),
  )) {
    document.querySelector(`[data-count="${group}"]`).textContent = String(count);
  }
  renderCaseList();
  setDirection(false);
  setWorkspace(location.hash === '#f2l' ? 'f2l' : 'play');
})();
