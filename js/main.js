(function () {
  const { FACES, describe } = window.RubikNotation;
  const {
    createSolvedState,
    applyTokens,
    isSolved,
  } = window.RubikState;
  const { CASES, GROUPS } = window.RubikF2L;
  const { renderCases } = window.RubikThumbnails;
  const CubeView = window.RubikCubeView;
  const detail = window.RubikF2LDetail;
  if (!detail) {
    console.error('RubikF2LDetail 未加载，F2L 详情页不可用。');
    return;
  }

  const canvas = document.getElementById('stage');
  const view = new CubeView(canvas, { interactive: true });
  let state = createSolvedState();
  view.setState(state);

  let chain = Promise.resolve();
  let animating = false;
  let moveCount = 0;

  const moveCountEl = document.getElementById('moveCount');
  const stateBadge = document.getElementById('stateBadge');
  const stateText = document.getElementById('stateText');
  const lookButton = document.getElementById('lookBottom');
  const scrambleButton = document.getElementById('scramble');
  const resetButton = document.getElementById('reset');
  const modePlayBtn = document.getElementById('modePlay');
  const modeF2LBtn = document.getElementById('modeF2L');
  const workspacePlay = document.getElementById('workspacePlay');
  const workspaceF2L = document.getElementById('workspaceF2L');
  const workspaceF2LDetail = document.getElementById('workspaceF2LDetail');

  function refreshStatus() {
    moveCountEl.textContent = moveCount;
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
    if (!move.silent) moveCount += 1;
    refreshStatus();
  }

  function queueMove(move) {
    chain = chain.then(() => runMove(move));
    return chain;
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

  window.addEventListener('keydown', (event) => {
    if (detail.isActive()) return;
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

  function setLookLabel() {
    lookButton.textContent = view.isBelow() ? '还原视角' : '转到下方看绿面';
  }

  lookButton.addEventListener('click', () => {
    const nowBelow = view.lookBelow();
    lookButton.textContent = nowBelow ? '还原视角' : '转到下方看绿面';
  });

  scrambleButton.addEventListener('click', () => {
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
      moveCount = 0;
      refreshStatus();
    });
  });

  resetButton.addEventListener('click', () => {
    if (animating) return;
    chain = chain.then(() => {
      state = createSolvedState();
      moveCount = 0;
      syncView();
      refreshStatus();
    });
  });

  function renderWorkspace(next) {
    const isF2L = next === 'f2l';
    const isDetail = next === 'detail';
    workspacePlay.classList.toggle('hidden', isF2L || isDetail);
    workspaceF2L.classList.toggle('hidden', !isF2L);
    workspaceF2LDetail.classList.toggle('hidden', !isDetail);
    modePlayBtn.classList.toggle('is-active', !isF2L && !isDetail);
    modeF2LBtn.classList.toggle('is-active', isF2L || isDetail);
    modePlayBtn.setAttribute('aria-pressed', String(!isF2L && !isDetail));
    modeF2LBtn.setAttribute('aria-pressed', String(isF2L || isDetail));
    view.setInteractive(!isF2L && !isDetail);
    if (!isF2L && !isDetail) requestAnimationFrame(() => view.resize());
  }

  modePlayBtn.addEventListener('click', () => {
    window.RubikRouter.navigate('');
  });
  modeF2LBtn.addEventListener('click', () => {
    window.RubikRouter.navigate('#f2l');
  });

  let drag = null;
  let suppressOrbit = false;
  let orbitDrag = null;
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
      if (animating || detail.isActive()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const hit = view.pick(event.clientX, event.clientY);
      if (!hit) {
        orbitDrag = {
          id: event.pointerId,
          lastX: event.clientX,
          lastY: event.clientY,
        };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
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
      if (orbitDrag && event.pointerId === orbitDrag.id) {
        const dx = event.clientX - orbitDrag.lastX;
        const dy = event.clientY - orbitDrag.lastY;
        orbitDrag.lastX = event.clientX;
        orbitDrag.lastY = event.clientY;
        view.orbitBy(dx, dy);
        return;
      }
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 16) return;
      const move = resolveDrag(dx, dy);
      drag = null;
      if (move) queueMove(move);
    },
    true,
  );

  function endDrag(event) {
    if (drag && event.pointerId === drag.id) drag = null;
    if (orbitDrag && event.pointerId === orbitDrag.id) orbitDrag = null;
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
      button.addEventListener('click', () => {
        window.RubikRouter.navigate('#f2l/' + item.n);
      });
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
    window.RubikRouter.navigate('#f2l/' + pick.n);
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

  function parseRoute() {
    const match = location.hash.match(/^#f2l\/(\d+)$/);
    if (match) {
      const caseData = CASES.find((item) => item.n === Number(match[1]));
      return caseData ? { view: 'detail', caseData } : { view: 'f2l' };
    }
    return location.hash === '#f2l' ? { view: 'f2l' } : { view: 'play' };
  }

  let lastView = null;
  function route() {
    const routeState = parseRoute();
    const leavingDetail = lastView === 'detail' && routeState.view !== 'detail';
    const previousCase = leavingDetail ? detail.currentCase() : null;

    if (routeState.view !== 'detail') detail.hide();
    renderWorkspace(routeState.view);
    if (routeState.view === 'detail') detail.show(routeState.caseData);

    if (routeState.view === 'play') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else if (routeState.view === 'f2l') {
      if (leavingDetail) {
        const card = listEl.querySelector('[data-case="' + previousCase?.n + '"]');
        requestAnimationFrame(() => {
          card?.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }

    lastView = routeState.view;
  }

  window.RubikRouter = {
    navigate(hash) {
      const target = hash || location.pathname + location.search;
      if (hash && location.hash === hash) {
        route();
        return;
      }
      if (!hash) {
        history.pushState(null, '', target);
        route();
        return;
      }
      location.hash = hash;
    },
    route,
  };

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  route();
})();
