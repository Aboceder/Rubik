(function () {
  const { parseAlg, tokenAngle, invertAlg } = window.RubikNotation;
  const {
    applyTokens,
    createSolvedState,
    toLocalState,
  } = window.RubikState;
  const { GROUPS, CASES } = window.RubikF2L;
  const CubeView = window.RubikCubeView;

  const dialog = document.getElementById('f2lDialog');
  const f2lSheet = document.getElementById('f2lSheet');
  const dialogBody = f2lSheet.querySelector('div');
  const closeBtn = document.getElementById('f2lClose');

  let current = null;
  let view = null;
  let tokens = [];
  let cursor = 0;
  let playing = false;
  let playToken = 0;
  let loop = false;
  let speed = 260;
  let setupState = null;
  let stepControls = null;

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
    const active = current?.teach?.phases
      ? current.teach.phases.findIndex(
          (phase) => cursor >= phase.from && cursor < phase.to,
        )
      : -1;
    dialogBody.querySelectorAll('[data-phase]').forEach((card) => {
      const isCurrent = Number(card.dataset.phase) === active;
      card.classList.toggle('is-current', isCurrent);
      card.setAttribute('aria-current', isCurrent ? 'step' : 'false');
    });
    const currentPhase = current?.teach?.phases?.find(
      (phase) => cursor >= phase.from && cursor < phase.to,
    );
    const hint = dialogBody.querySelector('[data-role="phase-hint"]');
    if (hint) {
      hint.textContent = currentPhase
        ? currentPhase.title + '：' + currentPhase.note
        : cursor >= tokens.length
          ? '公式完成，右前槽已经复原。'
          : '';
    }
  }

  function renderTokenList() {
    const list = dialogBody.querySelector('[data-role="tokens"]');
    const progress = dialogBody.querySelector('#f2lProgress');
    const meta = dialogBody.querySelector('#f2lMeta');
    const playButton = dialogBody.querySelector('#f2lPlay');
    list.innerHTML = '';
    tokens.forEach((token, index) => {
      const chip = document.createElement('span');
      chip.className = 'tok';
      if (index < cursor) chip.classList.add('is-past');
      if (index === cursor) chip.classList.add('is-now');
      chip.textContent = token.label;
      list.appendChild(chip);
    });
    progress.max = Math.max(1, tokens.length);
    progress.value = Math.min(cursor, tokens.length);
    meta.textContent = cursor + '/' + tokens.length + ' 步';
    playButton.textContent = playing ? '暂停' : cursor >= tokens.length ? '重播' : '播放';
    playButton.classList.toggle('btn-neutral', playing);
    renderTeachProgress();
  }

  function refreshStepButtons() {
    const prev = dialogBody.querySelector('[data-role="dialog-prev"]');
    const next = dialogBody.querySelector('[data-role="dialog-next"]');
    if (!prev || !next || !stepControls) return;
    prev.disabled = stepControls.isBusy() || cursor === 0;
    next.disabled = stepControls.isBusy() || cursor >= tokens.length;
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
    if (token.all) return Promise.resolve();
    return view.animateTurn(token.axis, token.layers, angle, speed);
  }

  async function play() {
    if (!current || playing) return;
    if (cursor >= tokens.length) {
      cursor = 0;
      syncState();
    }
    const myToken = ++playToken;
    playing = true;
    renderTokenList();
    refreshStepButtons();
    while (playing && playToken === myToken && cursor < tokens.length) {
      const token = tokens[cursor];
      await animateToken(token);
      cursor += 1;
      syncState();
      renderTokenList();
      refreshStepButtons();
      if (!playing || playToken !== myToken) return;
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
    if (!playing || playToken !== myToken) return;
    playing = false;
    renderTokenList();
    refreshStepButtons();
    if (loop) {
      setTimeout(() => {
        if (dialog.open && current) {
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

  async function stepForward() {
    if (!current || playing || cursor >= tokens.length) return;
    if (stepControls) stepControls.setBusy(true);
    refreshStepButtons();
    const token = tokens[cursor];
    await animateToken(token);
    cursor += 1;
    syncState();
    renderTokenList();
    if (stepControls) stepControls.setBusy(false);
    refreshStepButtons();
  }

  async function stepBack() {
    if (!current || playing || cursor === 0) return;
    if (stepControls) stepControls.setBusy(true);
    refreshStepButtons();
    const token = tokens[cursor - 1];
    const inverse = {
      ...token,
      amount: -token.amount,
      label: token.base + (token.amount === 1 ? "'" : token.amount === 2 ? '2' : ''),
    };
    await animateToken(inverse);
    cursor -= 1;
    syncState();
    renderTokenList();
    if (stepControls) stepControls.setBusy(false);
    refreshStepButtons();
  }

  function makeButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function open(caseData) {
    stopPlayback();
    current = caseData;
    stepControls = null;
    tokens = parseAlg(caseData.alg);
    cursor = 0;
    loop = false;
    speed = 260;
    const setup = applyTokens(createSolvedState(), invertAlg(caseData.alg));
    setupState = toLocalState(setup.state, setup.frame);

    dialogBody.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'dialog-head flex items-start justify-between gap-3';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'mono text-[9.5px] uppercase tracking-[.2em] text-primary';
    eyebrow.textContent = 'F2L CASE ' + String(caseData.n).padStart(2, '0');
    const title = document.createElement('h2');
    title.className = 'display dialog-title mt-1 tracking-tight';
    title.textContent = GROUPS[caseData.group] || 'F2L';
    titleWrap.append(eyebrow, title);

    const headActions = document.createElement('div');
    headActions.className = 'flex items-center gap-2';
    const caseIndex = CASES.findIndex((item) => item.n === caseData.n);
    const prevCase = makeButton('', 'btn btn-sm btn-square', () => {
      open(CASES[(caseIndex - 1 + CASES.length) % CASES.length]);
    });
    prevCase.setAttribute('aria-label', '上一个 case');
    prevCase.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const nextCase = makeButton('', 'btn btn-sm btn-square', () => {
      open(CASES[(caseIndex + 1) % CASES.length]);
    });
    nextCase.setAttribute('aria-label', '下一个 case');
    nextCase.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-sm btn-square btn-ghost';
    close.setAttribute('aria-label', '关闭');
    close.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener('click', () => dialog.close());
    const counter = document.createElement('span');
    counter.className = 'mono mr-1 hidden text-[10px] text-[var(--ink-soft)] sm:inline';
    counter.textContent = String(caseIndex + 1) + ' / ' + CASES.length;
    headActions.append(counter, prevCase, nextCase, close);
    head.append(titleWrap, headActions);

    const layout = document.createElement('div');
    layout.className =
      'dialog-layout mt-4 grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_290px]';

    const stage = document.createElement('div');
    stage.className =
      'stage-shell dialog-stage relative overflow-hidden sm:min-h-[440px]';
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full touch-none';
    canvas.setAttribute('aria-label', '当前 F2L 局面的三维魔方');
    stage.appendChild(canvas);

    const side = document.createElement('div');
    side.className = 'dialog-side';
    const sideScroll = document.createElement('div');
    sideScroll.className = 'dialog-scroll flex flex-col gap-2.5';

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
    const algText = document.createElement('p');
    algText.className =
      'mono mt-2 rounded-full bg-[var(--color-base-200)] px-3 py-1.5 text-[10.5px] tracking-wide text-[var(--ink-soft)]';
    algText.textContent = caseData.alg;
    idea.append(ideaLabel, ideaCopy, algText);
    info.append(look, idea);

    const phases = document.createElement('div');
    phases.className = 'panel p-2';
    const phasesLabel = document.createElement('p');
    phasesLabel.className = 'teach-label px-2 pb-1.5 pt-1';
    phasesLabel.textContent = '03 · 公式拆解';
    const phaseList = document.createElement('div');
    phaseList.className = 'grid gap-1';
    (teach.phases || []).forEach((phase, index) => {
      const phaseCard = makeButton('', 'phase-card', () => {
        if (playing || !current) return;
        cursor = phase.from;
        syncState();
        renderTokenList();
      });
      phaseCard.dataset.phase = String(index);
      phaseCard.setAttribute('aria-label', '跳到阶段：' + phase.title);
      const phaseTitle = document.createElement('strong');
      const dot = document.createElement('i');
      dot.className = 'phase-dot';
      const titleText = document.createElement('span');
      titleText.textContent = phase.title;
      phaseTitle.append(dot, titleText);
      const note = document.createElement('span');
      note.textContent = phase.note;
      phaseCard.append(phaseTitle, note);
      phaseList.appendChild(phaseCard);
    });
    phases.append(phasesLabel, phaseList);

    const tokenList = document.createElement('div');
    tokenList.dataset.role = 'tokens';
    tokenList.className = 'flex min-h-[30px] flex-wrap gap-1';

    const meta = document.createElement('p');
    meta.id = 'f2lMeta';
    meta.className = 'mono text-[10.5px] opacity-50';

    const progress = document.createElement('progress');
    progress.id = 'f2lProgress';
    progress.className = 'progress progress-primary h-1.5 w-full';
    progress.max = Math.max(1, tokens.length);
    progress.value = 0;

    const phaseHint = document.createElement('p');
    phaseHint.dataset.role = 'phase-hint';
    phaseHint.className = 'min-h-[34px] rounded-xl bg-[var(--color-base-200)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--ink-soft)]';

    const controls = document.createElement('div');
    controls.className = 'mt-1 flex items-center gap-2';
    const prev = makeButton('', 'btn btn-sm btn-square', stepBack);
    prev.setAttribute('aria-label', '上一步');
    prev.dataset.role = 'dialog-prev';
    prev.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const playButton = makeButton('播放', 'btn btn-sm flex-1', () => {
      if (playing) {
        stopPlayback();
        renderTokenList();
      } else {
        play();
      }
    });
    playButton.id = 'f2lPlay';
    const next = makeButton('', 'btn btn-sm btn-square', stepForward);
    next.setAttribute('aria-label', '下一步');
    next.dataset.role = 'dialog-next';
    next.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    const resetPlay = makeButton('重置', 'btn btn-sm btn-ghost btn-xs', () => {
      stopPlayback();
      cursor = 0;
      syncState();
      renderTokenList();
    });
    controls.append(prev, playButton, next, resetPlay);
    let stepping = false;
    const updateSteps = () => {
      prev.disabled = stepping || cursor === 0;
      next.disabled = stepping || cursor >= tokens.length;
    };
    stepControls = {
      isBusy: () => stepping,
      setBusy(value) {
        stepping = value;
        updateSteps();
      },
    };
    updateSteps();

    const options = document.createElement('div');
    options.className = 'flex items-center justify-between gap-2 text-[11.5px]';
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

    const player = document.createElement('div');
    player.className = 'panel dialog-player p-3';
    player.append(tokenList, meta, progress, phaseHint, controls, options);

    sideScroll.append(info, phases);
    side.append(sideScroll, player);
    layout.append(stage, side);

    const hint = document.createElement('p');
    hint.className = 'mt-3 text-[10.5px] leading-relaxed opacity-45';
    hint.innerHTML =
      '点击阶段可跳转至该段；<kbd class="kbd kbd-xs">&larr;</kbd> <kbd class="kbd kbd-xs">&rarr;</kbd> 单步 · <kbd class="kbd kbd-xs">Space</kbd> 播放／暂停 · 拖动换视角';

    dialogBody.append(head, layout, hint);
    renderTokenList();
    dialog.showModal();
    dialogBody.tabIndex = -1;
    dialogBody.focus({ preventScroll: true });

    destroyView();
    view = new CubeView(canvas, { interactive: true });
    view.setState(setupState);
    view.resize();
  }

  function currentCaseFromDialog() {
    return current;
  }

  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stopPlayback();
    destroyView();
    current = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (!current) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepForward();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepBack();
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (playing) {
        stopPlayback();
        renderTokenList();
      } else {
        play();
      }
    }
  });

  window.RubikDialog = {
    open,
    isOpen: () => dialog.open,
    currentCase: currentCaseFromDialog,
  };
})();
