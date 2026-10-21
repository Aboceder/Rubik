(function () {
  const { parseAlg, tokenAngle, invertAlg, labelFor } = window.RubikNotation;
  const { applyTokens, createSolvedState, toLocalState } = window.RubikState;
  const { GROUPS, CASES } = window.RubikF2L;
  const CubeView = window.RubikCubeView;

  const section = document.getElementById('workspaceF2LDetail');
  const body = document.getElementById('f2lDetailBody');

  let current = null;
  let view = null;
  let tokens = [];
  let cursor = 0;
  let playing = false;
  let playToken = 0;
  let loop = false;
  let speed = 260;
  let setupState = null;
  let busy = false;
  let active = false;
  let generation = 0;

  let tokenListEl = null;
  let progressEl = null;
  let metaEl = null;
  let playButton = null;
  let previousButton = null;
  let nextButton = null;
  let phaseHintEl = null;

  function stopPlayback() {
    playing = false;
    playToken += 1;
  }

  function destroyView() {
    if (!view) return;
    view.renderer.setAnimationLoop(null);
    view.renderer.dispose();
    view.renderer.forceContextLoss();
    if (view.scene.environment) view.scene.environment.dispose();
    view.resizeObserver.disconnect();
    view = null;
  }

  function renderTeachProgress() {
    const activePhase = current?.teach?.phases
      ? current.teach.phases.findIndex(
          (phase) => cursor >= phase.from && cursor < phase.to,
        )
      : -1;

    body.querySelectorAll('[data-phase]').forEach((card) => {
      const isCurrent = Number(card.dataset.phase) === activePhase;
      card.classList.toggle('is-current', isCurrent);
      card.setAttribute('aria-current', isCurrent ? 'step' : 'false');
    });

    const currentPhase = current?.teach?.phases?.find(
      (phase) => cursor >= phase.from && cursor < phase.to,
    );
    if (!phaseHintEl) return;
    phaseHintEl.textContent = currentPhase
      ? currentPhase.title + '：' + currentPhase.note
      : cursor >= tokens.length
        ? '公式完成，右前槽已经复原。'
        : '先从识别局面开始，再按步骤观察角块和棱块如何配对。';
  }

  function renderTokenList() {
    if (!tokenListEl) return;
    tokenListEl.innerHTML = '';
    tokens.forEach((token, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tok';
      if (index < cursor) chip.classList.add('is-past');
      if (index === cursor) chip.classList.add('is-now');
      chip.textContent = token.label;
      chip.setAttribute(
        'aria-label',
        '跳到第 ' + (index + 1) + ' 步 ' + token.label + ' 之前',
      );
      chip.addEventListener('click', () => jumpToStep(index));
      tokenListEl.appendChild(chip);
    });

    progressEl.max = Math.max(1, tokens.length);
    progressEl.value = Math.min(cursor, tokens.length);
    metaEl.textContent = cursor + '/' + tokens.length + ' 步';
    playButton.textContent = playing
      ? '暂停'
      : cursor >= tokens.length
        ? '重播'
        : '播放';
    playButton.classList.toggle('btn-neutral', playing);
    renderTeachProgress();
  }

  function refreshStepButtons() {
    if (!previousButton || !nextButton) return;
    previousButton.disabled = busy || playing || cursor === 0;
    nextButton.disabled = busy || playing || cursor >= tokens.length;
  }

  function currentState() {
    if (!setupState) return createSolvedState();
    if (cursor === 0) return setupState;
    const result = applyTokens(setupState, tokens.slice(0, cursor));
    return toLocalState(result.state, result.frame);
  }

  function syncState() {
    if (view) view.setState(currentState());
    refreshStepButtons();
  }

  function animateToken(token) {
    if (!view) return Promise.resolve();
    const angle = tokenAngle(token);
    const duration = token.amount === 2 || token.all ? speed : speed * 0.72;
    if (token.all) return view.animateRotation(token.axis, angle, duration);
    return view.animateTurn(token.axis, token.layers, angle, duration);
  }

  function inverseToken(token) {
    return {
      ...token,
      amount: -token.amount,
      label: labelFor(token.base, -token.amount),
    };
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function play() {
    if (!current || playing) return;
    if (cursor >= tokens.length) {
      cursor = 0;
      syncState();
    }

    const run = generation;
    const myToken = ++playToken;
    playing = true;
    busy = false;
    renderTokenList();
    refreshStepButtons();

    while (playing && playToken === myToken && cursor < tokens.length) {
      const token = tokens[cursor];
      await animateToken(token);
      if (run !== generation) return;
      cursor += 1;
      syncState();
      renderTokenList();
      refreshStepButtons();
      if (!playing || playToken !== myToken) return;
      await new Promise((resolve) => setTimeout(resolve, 70));
    }

    if (run !== generation || !playing || playToken !== myToken) return;
    playing = false;
    renderTokenList();
    refreshStepButtons();

    if (loop) {
      setTimeout(() => {
        if (active && run === generation && current) {
          cursor = 0;
          syncState();
          play();
        }
      }, 650);
    } else if (cursor >= tokens.length) {
      window.dispatchEvent(
        new CustomEvent('f2l-complete', { detail: { caseNumber: current.n } }),
      );
    }
  }

  async function animateStep(direction) {
    if (!current || playing || busy) return;
    const destination = cursor + direction;
    if (destination < 0 || destination > tokens.length) return;

    const run = generation;
    busy = true;
    refreshStepButtons();
    try {
      if (!view) return;
      const token = direction > 0 ? tokens[cursor] : inverseToken(tokens[cursor - 1]);
      await animateToken(token);
      if (run !== generation) return;
      cursor = destination;
      syncState();
      renderTokenList();
    } finally {
      if (run === generation) {
        busy = false;
        refreshStepButtons();
      }
    }
  }

  function stepForward() {
    return animateStep(1);
  }

  function stepBack() {
    return animateStep(-1);
  }

  async function jumpToStep(target) {
    if (!current || busy) return;
    const destination = Math.max(0, Math.min(tokens.length, target));
    if (destination === cursor) return;

    stopPlayback();
    const run = generation;
    busy = true;
    renderTokenList();
    refreshStepButtons();

    try {
      if (!view) return;
      while (cursor < destination) {
        await nextFrame();
        await animateToken(tokens[cursor]);
        if (run !== generation) return;
        cursor += 1;
        syncState();
        renderTokenList();
      }
      while (cursor > destination) {
        await nextFrame();
        await animateToken(inverseToken(tokens[cursor - 1]));
        if (run !== generation) return;
        cursor -= 1;
        syncState();
        renderTokenList();
      }
    } finally {
      if (run === generation) {
        busy = false;
        refreshStepButtons();
        renderTokenList();
      }
    }
  }

  function makeButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function navigate(hash) {
    if (window.RubikRouter) {
      window.RubikRouter.navigate(hash);
    } else {
      location.hash = hash;
    }
  }

  function navigateCase(offset) {
    if (!current) return;
    const index = CASES.findIndex((item) => item.n === current.n);
    const nextCase = CASES[(index + offset + CASES.length) % CASES.length];
    navigate('#f2l/' + nextCase.n);
  }

  function buildHeader(caseData, caseIndex) {
    const head = document.createElement('header');
    head.className = 'detail-head';

    const titleRegion = document.createElement('div');
    const back = makeButton('', 'detail-back', () => navigate('#f2l'));
    back.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>全部公式</span>';

    const copy = document.createElement('div');
    copy.className = 'detail-head-copy';
    const caseLine = document.createElement('div');
    caseLine.className = 'detail-case-line';
    const number = document.createElement('span');
    number.className = 'detail-case-pill';
    number.textContent = 'CASE ' + String(caseData.n).padStart(2, '0') + ' / 41';
    const group = document.createElement('span');
    group.className = 'detail-case-group';
    group.textContent = GROUPS[caseData.group] || 'F2L';
    caseLine.append(number, group);

    const title = document.createElement('h2');
    title.className = 'display detail-title mt-2 tracking-tight';
    title.textContent = '右前槽 · ' + (GROUPS[caseData.group] || 'F2L');
    copy.append(caseLine, title);
    titleRegion.append(back, copy);

    const actions = document.createElement('div');
    actions.className = 'detail-head-actions';
    const counter = document.createElement('span');
    counter.className = 'mono mr-1 text-[10px] text-[var(--ink-soft)]';
    counter.textContent = caseIndex + 1 + ' / ' + CASES.length;

    const previous = makeButton('', 'detail-nav-btn', () => navigateCase(-1));
    previous.setAttribute('aria-label', '上一个公式');
    previous.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
    const next = makeButton('', 'detail-nav-btn', () => navigateCase(1));
    next.setAttribute('aria-label', '下一个公式');
    next.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    actions.append(counter, previous, next);

    head.append(titleRegion, actions);
    return head;
  }

  function buildStage() {
    const column = document.createElement('div');
    column.className = 'detail-stage-column';

    const stage = document.createElement('div');
    stage.className = 'stage-shell detail-stage-shell detail-stage relative';
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full touch-none';
    canvas.setAttribute('aria-label', '当前 F2L 局面的三维魔方');
    stage.appendChild(canvas);

    const meta = document.createElement('div');
    meta.className = 'detail-stage-meta';
    const viewHint = document.createElement('span');
    viewHint.className = 'stage-chip';
    viewHint.textContent = '拖动换视角';
    const look = makeButton('转到下方看绿面', 'stage-chip', () => {
      if (!view) return;
      const below = view.lookBelow();
      look.textContent = below ? '回到俯视' : '转到下方看绿面';
    });
    look.setAttribute('aria-label', '切换魔方观察角度');
    meta.append(viewHint, look);
    stage.appendChild(meta);

    const note = document.createElement('p');
    note.className = 'detail-stage-note';
    note.textContent = '绿面朝下。播放或单步时，三维魔方会按公式真实转动。';
    column.append(stage, note);
    return { column, canvas };
  }

  function buildInfo(caseData) {
    const info = document.createElement('div');
    info.className = 'panel p-3.5';
    const teach = caseData.teach || {};

    const look = document.createElement('div');
    look.className = 'teach-block';
    const lookLabel = document.createElement('p');
    lookLabel.className = 'teach-label';
    lookLabel.textContent = '01 · 识别局面';
    const lookCopy = document.createElement('p');
    lookCopy.className = 'teach-copy';
    lookCopy.textContent = teach.look || caseData.desc;
    look.append(lookLabel, lookCopy);

    const idea = document.createElement('div');
    idea.className = 'teach-block mt-2';
    const ideaLabel = document.createElement('p');
    ideaLabel.className = 'teach-label';
    ideaLabel.textContent = '02 · 解题思路';
    const ideaCopy = document.createElement('p');
    ideaCopy.className = 'teach-copy';
    ideaCopy.textContent = teach.goal || caseData.desc;
    const alg = document.createElement('code');
    alg.className = 'detail-alg';
    alg.textContent = caseData.alg;
    idea.append(ideaLabel, ideaCopy, alg);

    info.append(look, idea);
    return info;
  }

  function buildPhases(caseData) {
    const phases = document.createElement('div');
    phases.className = 'panel p-2';
    const label = document.createElement('p');
    label.className = 'teach-label px-2 pb-1.5 pt-1';
    label.textContent = '03 · 公式拆解';
    const list = document.createElement('div');
    list.className = 'grid gap-1';

    (caseData.teach?.phases || []).forEach((phase, index) => {
      const card = makeButton('', 'phase-card', () => jumpToStep(phase.from));
      card.dataset.phase = String(index);
      card.setAttribute('aria-label', '跳到阶段：' + phase.title);
      const title = document.createElement('strong');
      const dot = document.createElement('i');
      dot.className = 'phase-dot';
      const titleText = document.createElement('span');
      titleText.textContent = phase.title;
      title.append(dot, titleText);
      const note = document.createElement('span');
      note.textContent = phase.note;
      card.append(title, note);
      list.appendChild(card);
    });

    phases.append(label, list);
    return phases;
  }

  function buildPlayer() {
    const player = document.createElement('div');
    player.className = 'panel detail-player';

    tokenListEl = document.createElement('div');
    tokenListEl.dataset.role = 'tokens';
    tokenListEl.className = 'detail-token-list';

    metaEl = document.createElement('p');
    metaEl.className = 'mono mt-1 text-[10px] opacity-50';

    progressEl = document.createElement('progress');
    progressEl.id = 'f2lProgress';
    progressEl.className = 'progress progress-primary mt-1.5 h-1.5 w-full';
    progressEl.max = Math.max(1, tokens.length);
    progressEl.value = 0;

    phaseHintEl = document.createElement('p');
    phaseHintEl.dataset.role = 'phase-hint';
    phaseHintEl.className =
      'mt-2 rounded-xl bg-[var(--color-base-200)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--ink-soft)]';

    const controls = document.createElement('div');
    controls.className = 'mt-2 flex items-center gap-2';
    previousButton = makeButton('', 'btn btn-sm btn-square', stepBack);
    previousButton.setAttribute('aria-label', '上一步');
    previousButton.dataset.role = 'detail-prev';
    previousButton.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

    playButton = makeButton('播放', 'btn btn-sm flex-1', () => {
      if (playing) {
        stopPlayback();
        renderTokenList();
        refreshStepButtons();
      } else {
        play();
      }
    });
    playButton.id = 'f2lPlay';

    nextButton = makeButton('', 'btn btn-sm btn-square', stepForward);
    nextButton.setAttribute('aria-label', '下一步');
    nextButton.dataset.role = 'detail-next';
    nextButton.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    const reset = makeButton('重置', 'btn btn-sm btn-ghost btn-xs', () => {
      stopPlayback();
      cursor = 0;
      busy = false;
      syncState();
      renderTokenList();
    });
    controls.append(previousButton, playButton, nextButton, reset);

    const options = document.createElement('div');
    options.className = 'mt-1 flex items-center justify-between gap-2 text-[11.5px]';
    const loopLabel = document.createElement('label');
    loopLabel.className = 'flex cursor-pointer items-center gap-2';
    const loopInput = document.createElement('input');
    loopInput.type = 'checkbox';
    loopInput.className = 'toggle toggle-xs toggle-primary';
    loopInput.addEventListener('change', () => {
      loop = loopInput.checked;
    });
    const loopText = document.createElement('span');
    loopText.className = 'opacity-70';
    loopText.textContent = '循环';
    loopLabel.append(loopInput, loopText);

    const speedSelect = document.createElement('select');
    speedSelect.className = 'select select-xs';
    speedSelect.setAttribute('aria-label', '播放速度');
    [
      ['440', '慢'],
      ['260', '正常'],
      ['130', '快'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === '260') option.selected = true;
      speedSelect.appendChild(option);
    });
    speedSelect.addEventListener('change', () => {
      speed = Number(speedSelect.value);
    });
    options.append(loopLabel, speedSelect);

    player.append(tokenListEl, metaEl, progressEl, phaseHintEl, controls, options);
    return player;
  }

  function show(caseData) {
    if (!caseData) {
      hide();
      return;
    }

    if (active && current?.n === caseData.n) {
      requestAnimationFrame(() => view?.resize());
      return;
    }

    hide();
    active = true;
    current = caseData;
    const run = generation;
    tokens = parseAlg(caseData.alg);
    cursor = 0;
    loop = false;
    speed = 260;
    busy = false;
    const setup = applyTokens(createSolvedState(), invertAlg(caseData.alg));
    setupState = toLocalState(setup.state, setup.frame);

    const caseIndex = CASES.findIndex((item) => item.n === caseData.n);
    const head = buildHeader(caseData, caseIndex);
    const stageParts = buildStage();
    const info = buildInfo(caseData);
    const phases = buildPhases(caseData);
    const side = document.createElement('div');
    side.className = 'detail-side';
    side.append(info, phases);
    const player = buildPlayer();

    const layout = document.createElement('div');
    layout.className = 'detail-layout';
    layout.append(stageParts.column, side, player);

    const hint = document.createElement('p');
    hint.className =
      'detail-keyboard-hint mt-3 text-[10.5px] leading-relaxed opacity-45';
    hint.innerHTML =
      '点击阶段或步骤可跳转；<kbd class="kbd kbd-xs">&larr;</kbd> <kbd class="kbd kbd-xs">&rarr;</kbd> 单步 · <kbd class="kbd kbd-xs">Space</kbd> 播放／暂停 · 拖动换视角';

    body.innerHTML = '';
    body.append(head, layout, hint);
    section.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });

    view = new CubeView(stageParts.canvas, { interactive: true });
    view.setState(setupState);
    requestAnimationFrame(() => {
      if (run === generation) view?.resize();
    });
    renderTokenList();
    refreshStepButtons();
  }

  function hide() {
    if (!active) return;
    active = false;
    generation += 1;
    stopPlayback();
    destroyView();
    current = null;
    tokens = [];
    cursor = 0;
    busy = false;
    setupState = null;
    tokenListEl = null;
    progressEl = null;
    metaEl = null;
    playButton = null;
    previousButton = null;
    nextButton = null;
    phaseHintEl = null;
    body.innerHTML = '';
  }

  window.addEventListener('keydown', (event) => {
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target.closest?.('input, select, textarea');
    if (target) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepForward();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepBack();
    } else if (event.code === 'Space' && !event.target.closest?.('button, a')) {
      event.preventDefault();
      if (playing) {
        stopPlayback();
        renderTokenList();
        refreshStepButtons();
      } else {
        play();
      }
    }
  });

  window.RubikF2LDetail = {
    show,
    hide,
    isActive: () => active,
    currentCase: () => current,
  };
})();
