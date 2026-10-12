// ==UserScript==
// @name         RainExtract
// @namespace    https://examination.xuetangx.com
// @version      3.0.6
// @description  One-click expand all explanations and download exam questions. Supports both exam and result pages. SPA navigation aware. Toggle button hidden on exam pages.
// @author By Qwen3.7
// @match        https://examination.xuetangx.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 页面类型检测 ---------- */
  function getPageType() {
    const path = window.location.pathname || '';
    if (path.indexOf('/exam/') !== -1 || path.indexOf('/exam#') !== -1) {
      return 'exam';
    }
    if (path.indexOf('/result/') !== -1 || path.indexOf('/result#') !== -1) {
      return 'result';
    }
    return 'unknown';
  }

  let currentPageType = getPageType();

  /* ---------- Toast 提示样式 ---------- */
  GM_addStyle(`
    #xtq-panel {
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      box-sizing: border-box;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      transition: left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                  top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      pointer-events: none;
    }
    #xtq-box {
      width: 180px;
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px 14px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: auto;
      transition: border-radius 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
                  width 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
                  height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
                  padding 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
                  background-color 0.35s ease,
                  box-shadow 0.35s ease,
                  opacity 0.3s ease;
      cursor: grab;
      overflow: hidden;
    }
    #xtq-box:active {
      cursor: grabbing;
    }
    /* 折叠态 - 圆形悬浮球 */
    #xtq-box.xtq-collapsed {
      width: 44px !important;
      height: 44px !important;
      border-radius: 50% !important;
      background: #1677ff !important;
      box-shadow: 0 6px 18px rgba(22,119,255,.35) !important;
      padding: 0 !important;
    }
    /* 折叠态隐藏面板内容 */
    #xtq-box.xtq-collapsed #xtq-panel-content {
      opacity: 0 !important;
      pointer-events: none !important;
      display: none !important;
    }
    /* 折叠态显示悬浮球图标 */
    #xtq-box.xtq-collapsed #xtq-ball-icon {
      display: flex !important;
    }
    #xtq-ball-icon {
      display: none;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    #xtq-hint {
      font-size: 12px;
      color: #555;
      text-align: center;
      line-height: 1.5;
    }
    #xtq-btn-toggle,
    #xtq-btn-save,
    #xtq-btn-close {
      width: 100%;
      border: none;
      border-radius: 10px;
      background: #1677ff;
      color: #fff;
      cursor: pointer;
      display: block;
      margin-bottom: 2px;
    }
    #xtq-btn-close {
      margin-bottom: 0;
    }
    #xtq-btn-toggle {
      height: 36px;
      font-size: 14px;
    }
    #xtq-btn-save {
      height: 36px;
      font-size: 14px;
    }
    #xtq-btn-close {
      height: 30px;
      font-size: 13px;
      border-radius: 8px;
    }
    #xtq-btn-toggle:hover,
    #xtq-btn-save:hover,
    #xtq-btn-close:hover {
      background: #0958d9;
    }
    /* Toast 样式 */
    #xtq-toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      z-index: 100000;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease, transform 0.5s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    #xtq-toast.xtq-fade-in {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #xtq-toast.xtq-fade-out {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    #xtq-toast.xtq-toast-success {
      background: #6aab5e;
    }
    #xtq-toast.xtq-toast-error {
      background: #d46b6b;
    }
    #xtq-toast.xtq-toast-warning {
      background: #FFE082;
      color: #424242;
      box-shadow: 0 4px 12px rgba(255, 224, 130, 0.45);
    }
  `);

  /* ---------- 面板 ---------- */
  const panel = document.createElement('div');
  panel.id = 'xtq-panel';

  const box = document.createElement('div');
  box.id = 'xtq-box';

  // 悬浮球图标（仅折叠态可见）
  const ballIcon = document.createElement('div');
  ballIcon.id = 'xtq-ball-icon';
  ballIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

  const hint = document.createElement('div');
  hint.id = 'xtq-hint';
  hint.textContent = 'RainExtract By Qwen3.7';

  const btnToggle = document.createElement('button');
  btnToggle.id = 'xtq-btn-toggle';
  btnToggle.textContent = '展开所有解析';

  const btnSave = document.createElement('button');
  btnSave.id = 'xtq-btn-save';
  btnSave.textContent = '保存所有试题';

  const btnClose = document.createElement('button');
  btnClose.id = 'xtq-btn-close';
  btnClose.textContent = '收起';

  // 面板内容容器
  const panelContent = document.createElement('div');
  panelContent.id = 'xtq-panel-content';
  panelContent.append(hint, btnToggle, btnSave, btnClose);

  // box 包含图标和面板内容（不再有独立的 ball 元素）
  box.append(ballIcon, panelContent);
  panel.append(box);
  document.documentElement.appendChild(panel);

  /* ---------- Toast 提示函数 ---------- */
  function showToast(message, type) {
    const existing = document.getElementById('xtq-toast');
    if (existing) {
      existing.remove();
    }
    const toast = document.createElement('div');
    toast.id = 'xtq-toast';
    toast.textContent = message;
    if (type === 'success') {
      toast.classList.add('xtq-toast-success');
    } else if (type === 'error') {
      toast.classList.add('xtq-toast-error');
    } else if (type === 'warning') {
      toast.classList.add('xtq-toast-warning');
    }
    document.documentElement.appendChild(toast);
    requestAnimationFrame(function() {
      toast.classList.add('xtq-fade-in');
    });
    setTimeout(function() {
      toast.classList.remove('xtq-fade-in');
      toast.classList.add('xtq-fade-out');
      setTimeout(function() {
        toast.remove();
      }, 500);
    }, 2000);
  }

  /* ---------- 面板状态管理 ---------- */
  let collapsed = false;
  let isAnimating = false;
  let justDragged = false;

  function collapse() {
    if (isAnimating || collapsed) return;
    isAnimating = true;
    collapsed = true;

    // 获取当前面板位置
    const rect = panel.getBoundingClientRect();

    // 计算贴边目标位置（考虑面板展开后的中心对齐偏移）
    const ballW = 44;
    const ballH = 44;

    // 面板展开后的尺寸常量
    const panelW = 180;
    const panelH = 180;
    // 【关键修复】展开后面板中心对齐球中心，收起时需补偿偏移量
    const centerOffset = panelH / 2 - ballH / 2; // = 90 - 22 = 68
    const centerOffsetH = panelW / 2 - ballW / 2; // = 90 - 22 = 68

    const distLeft = rect.left;
    const distRight = window.innerWidth - rect.right;
    const distTop = rect.top;
    const distBottom = window.innerHeight - rect.bottom;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    let targetLeft = rect.left;
    let targetTop = rect.top;

    if (minDist === distLeft) {
      // 球在左边 → 贴左边框
      targetLeft = 0;
      // 补偿面板中心对齐偏移：球的顶部 = 面板顶部 + 偏移量
      targetTop = rect.top + centerOffset;
    } else if (minDist === distRight) {
      // 球在右边 → 贴右边框
      targetLeft = window.innerWidth - ballW;
      // 补偿面板中心对齐偏移：球的顶部 = 面板顶部 + 偏移量
      targetTop = rect.top + centerOffset;
    } else if (minDist === distTop) {
      // 球在上边 → 贴上边框
      targetTop = 0;
      // 补偿面板中心对齐偏移：球的左侧 = 面板左侧 + 偏移量
      targetLeft = rect.left + centerOffsetH;
    } else {
      // 球在下边 → 贴下边框
      targetTop = window.innerHeight - ballH;
      // 补偿面板中心对齐偏移：球的左侧 = 面板左侧 + 偏移量
      targetLeft = rect.left + centerOffsetH;
    }

    // 【修复】先禁用过渡，清除right/transform，设置left/top为当前位置以保持视觉不变
    panel.style.transition = 'none';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    // 强制回流，确保浏览器应用了上面的定位更改
    panel.offsetHeight;
    // 启用位置过渡动画（与折叠尺寸动画同时进行）
    panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    // 设置目标位置（触发动画：面板从当前位置平滑移动到贴边位置）
    panel.style.left = targetLeft + 'px';
    panel.style.top = targetTop + 'px';

    // 同时开始折叠动画（尺寸过渡：180px -> 44px）
    box.classList.add('xtq-collapsed');

    // 动画完成后释放锁
    setTimeout(function() {
      isAnimating = false;
    }, 480);
  }

  function expand() {
    if (isAnimating || !collapsed) return;
    isAnimating = true;
    collapsed = false;

    // 获取当前球的位置（视觉位置）
    const ballRect = panel.getBoundingClientRect();
    const ballW = ballRect.width || 44;
    const ballH = ballRect.height || 44;

    // 【关键修复】先禁用过渡动画，将面板定位从 CSS 的 right/top/transform 模式切换到 left/top 模式
    // 保持视觉位置不变，避免 transform 移除导致的向上跳变
    // 面板宽度由CSS控制（box width: 180px + box-sizing: border-box），无需JS显式设置
    panel.style.transition = 'none';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.left = ballRect.left + 'px';
    panel.style.top = ballRect.top + 'px';
    // 强制回流，确保浏览器应用了上面的定位更改
    panel.offsetHeight;
    // 重新启用位置过渡动画
    panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    // 再移除折叠类（开始展开尺寸动画）
    box.classList.remove('xtq-collapsed');

    // 面板尺寸常量
    const panelWidth = 180;
    const panelHeight = 180; // 展开后近似高度

    // 根据悬浮球距离哪边最近，决定面板展开方向（贴边居中）
    const distLeft = ballRect.left;
    const distRight = window.innerWidth - ballRect.right;
    const distTop = ballRect.top;
    const distBottom = window.innerHeight - ballRect.bottom;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    let targetLeft, targetTop;

    if (minDist === distLeft) {
      // 球在左边 → 面板贴左边框，垂直居中
      targetLeft = 0;
      targetTop = ballRect.top + ballH / 2 - panelHeight / 2;
    } else if (minDist === distRight) {
      // 球在右边 → 面板贴右边框，垂直居中
      targetLeft = window.innerWidth - panelWidth;
      targetTop = ballRect.top + ballH / 2 - panelHeight / 2;
    } else if (minDist === distTop) {
      // 球在上边 → 面板贴上边框，水平居中
      targetLeft = ballRect.left + ballW / 2 - panelWidth / 2;
      targetTop = 0;
    } else {
      // 球在下边 → 面板贴下边框，水平居中
      targetLeft = ballRect.left + ballW / 2 - panelWidth / 2;
      targetTop = window.innerHeight - panelHeight;
    }

    // 限制在屏幕范围内
    targetLeft = Math.max(0, Math.min(targetLeft, window.innerWidth - panelWidth));
    targetTop = Math.max(0, Math.min(targetTop, window.innerHeight - panelHeight));

    // 设置目标位置（触发过渡动画：面板从悬浮球位置平滑移动到贴边居中位置）
    panel.style.left = targetLeft + 'px';
    panel.style.top = targetTop + 'px';

    // 展开完成后限制在屏幕内
    setTimeout(function() {
      isAnimating = false;
      clampPanel();
    }, 480);
  }

  btnClose.addEventListener('click', collapse);
  box.addEventListener('click', function(e) {
    // 点击悬浮球（折叠态）且非按钮时展开，排除刚拖动完的情况
    if (collapsed && !e.target.closest('button') && !justDragged) {
      expand();
    }
  });

  /* ---------- 拖动 ---------- */
  let dragging = false;
  let dragStarted = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function startDrag(e) {
    // 排除按钮点击
    if (e.target.closest('button')) return;
    dragging = true;
    dragStarted = false;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    // 拖动时禁用过渡，实现实时跟随
    panel.style.transition = 'none';
    box.style.transition = 'none';
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!dragging) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    // 阈值：移动超过5px才算拖动
    if (!dragStarted && (dx > 5 || dy > 5)) {
      dragStarted = true;
    }
    if (!dragStarted) return;
    const newLeft = startLeft + (e.clientX - startX);
    const newTop = startTop + (e.clientY - startY);
    const boxRect = box.getBoundingClientRect();
    const w = boxRect.width || 180;
    const h = boxRect.height || 180;
    panel.style.left = Math.max(0, Math.min(newLeft, window.innerWidth - w)) + 'px';
    panel.style.top = Math.max(0, Math.min(newTop, window.innerHeight - h)) + 'px';
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    // 恢复过渡动画
    panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    box.style.transition = '';
    // 如果不是拖动（只是点击），不做贴边
    if (!dragStarted) return;
    // 拖动结束后设置标志，防止 click 事件触发展开
    justDragged = true;
    setTimeout(function() { justDragged = false; }, 100);
    // 拖动结束后自动贴边（带轨迹动画）- 无论折叠/展开状态都吸附到最近边缘
    stickToEdge(true);
  }

  box.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  // 触摸支持
  box.addEventListener('touchstart', function(e) {
    if (e.target.closest('button')) return;
    const touch = e.touches[0];
    dragging = true;
    dragStarted = false;
    const rect = panel.getBoundingClientRect();
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.transition = 'none';
    box.style.transition = 'none';
  }, { passive: false });

  window.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (!dragStarted && (dx > 5 || dy > 5)) {
      dragStarted = true;
    }
    if (!dragStarted) return;
    const newLeft = startLeft + (touch.clientX - startX);
    const newTop = startTop + (touch.clientY - startY);
    const boxRect = box.getBoundingClientRect();
    const w = boxRect.width || 180;
    const h = boxRect.height || 180;
    panel.style.left = Math.max(0, Math.min(newLeft, window.innerWidth - w)) + 'px';
    panel.style.top = Math.max(0, Math.min(newTop, window.innerHeight - h)) + 'px';
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', endDrag);

  /* ---------- 窗口大小变化时悬浮球自动贴边 ---------- */
  window.addEventListener('resize', function() {
    // 拖动时不干扰，窗口变化时自动吸附到最近边缘
    if (!dragging) {
      stickToEdge(true);
    }
  });

  /* ---------- 边界限制 ---------- */
  function clampPanel() {
    const rect = panel.getBoundingClientRect();
    const w = rect.width || 180;
    const h = rect.height || 180;
    const maxLeft = window.innerWidth - w;
    const maxTop = window.innerHeight - h;
    const left = Math.max(0, Math.min(parseFloat(panel.style.left) || rect.left, maxLeft));
    const top = Math.max(0, Math.min(parseFloat(panel.style.top) || rect.top, maxTop));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
  }

  /* ---------- 悬浮球自动贴边（带轨迹动画） ---------- */
  function stickToEdge(animate) {
    const rect = panel.getBoundingClientRect();
    const boxW = box.classList.contains('xtq-collapsed') ? 44 : (rect.width || 180);
    const boxH = box.classList.contains('xtq-collapsed') ? 44 : (rect.height || 180);

    const distLeft = rect.left;
    const distRight = window.innerWidth - rect.right;
    const distTop = rect.top;
    const distBottom = window.innerHeight - rect.bottom;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    let newLeft = rect.left;
    let newTop = rect.top;

    if (minDist === distLeft) {
      // 贴左边框，保持当前垂直位置
      newLeft = 0;
      newTop = rect.top;
    } else if (minDist === distRight) {
      // 贴右边框，保持当前垂直位置
      newLeft = window.innerWidth - boxW;
      newTop = rect.top;
    } else if (minDist === distTop) {
      // 贴上边框，保持当前水平位置
      newTop = 0;
      newLeft = rect.left;
    } else {
      // 贴下边框，保持当前水平位置
      newTop = window.innerHeight - boxH;
      newLeft = rect.left;
    }

    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - boxW));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - boxH));

    // 【修复】先禁用过渡，清除right/transform，设置left/top为当前位置以保持视觉不变
    panel.style.transition = 'none';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    // 强制回流
    panel.offsetHeight;
    // 再启用过渡并设置目标位置
    if (animate) {
      panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    } else {
      panel.style.transition = 'none';
    }
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  /* ---------- 功能1：展开 / 收起解析 ---------- */
  let expanded = false;

  function getBodies() {
    if (currentPageType === 'exam') {
      return Array.from(
        document.querySelectorAll(
          '.exam-main--content .subject-item .exercise-item .item-footer .item-footer--body'
        )
      );
    }
    return Array.from(
      document.querySelectorAll(
        '.exam-main--content .subject-item .result_item .item-footer .item-footer--body'
      )
    );
  }

  function applyToggle(show) {
    getBodies().forEach(function(el) {
      if (show) {
        el.style.removeProperty('display');
        if (el.style.display === 'none') el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function setToggleUI() {
    btnToggle.textContent = expanded ? '收起所有解析' : '展开所有解析';
  }

  btnToggle.addEventListener('click', function() {
    expanded = !expanded;
    applyToggle(expanded);
    setToggleUI();
    if (expanded) {
      showToast('已展开所有解析');
    } else {
      showToast('已收起所有解析');
    }
  });

  /* ---------- 工具函数 ---------- */
  function cleanTitle(raw) {
    if (!raw) return '试题';
    return raw.replace(/\s*多次答题取\s*最高成绩\s*/g, '').trim() || '试题';
  }

  function parseNumberPrefix(str) {
    const m = str.match(/^(\d+)/);
    return m ? m[1] : '';
  }

  function esc(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  /* ---------- 提取试题数据 ---------- */
  function extractQuestions() {
    const examMain = document.querySelector('.app-container .exam-main');
    if (!examMain) throw new Error('未找到试题区域');

    let items;
    if (currentPageType === 'exam') {
      items = Array.from(
        examMain.querySelectorAll('.exam-main--content .subject-item .exercise-item')
      );
    } else {
      items = Array.from(
        examMain.querySelectorAll('.exam-main--content .subject-item .result_item')
      );
    }

    if (items.length === 0) throw new Error('未找到试题');

    const questions = [];

    items.forEach(function(item) {
      const q = {};

      const typeEl = item.querySelector('.item-type');
      if (typeEl) {
        const raw = typeEl.textContent.trim();
        const num = parseNumberPrefix(raw);
        q.number = num || '';
      }

      let stemEl = item.querySelector('.item-body .exam-font p');
      if (!stemEl || !stemEl.textContent.trim()) {
        stemEl = item.querySelector('.item-body .clearfix.exam-font');
      }
      if (!stemEl || !stemEl.textContent.trim()) {
        const h4 = item.querySelector('.item-body h4');
        if (h4) {
          stemEl = h4.querySelector('p');
        }
      }
      q.stem = stemEl ? stemEl.textContent.trim() : '';

      q.options = [];
      const ul = item.querySelector('.item-body ul.list-unstyled.list-unstyled-radio');
      if (ul) {
        const lis = Array.from(ul.querySelectorAll(':scope > li'));
        lis.forEach(function(li) {
          const label = li.querySelector('label');
          if (!label) return;
          const radioInput = label.querySelector('.radioInput');
          const radioText = label.querySelector('.radioText p, .radioText');
          const letter = radioInput ? radioInput.textContent.trim() : '';
          const content = radioText ? radioText.textContent.trim() : '';
          if (letter && content) {
            q.options.push(letter + '.' + content);
          }
        });
      }

      q.answer = '';
      if (currentPageType === 'result') {
        const footer = item.querySelector('.item-footer');
        if (footer) {
          const bodyEl = footer.querySelector('.item-footer--body');
          if (bodyEl) {
            q.answer = bodyEl.textContent.trim();
          }
          if (!q.answer) {
            const header = footer.querySelector('.item-footer--header');
            if (header) {
              const spans = Array.from(header.querySelectorAll('span'));
              spans.forEach(function(span) {
                const t = span.textContent.trim();
                if (t && t !== '正确答案：') {
                  q.answer = t;
                }
              });
            }
          }
        }
      }

      questions.push(q);
    });

    return questions;
  }

  /* ---------- 功能2：保存试题 ---------- */
  btnSave.addEventListener('click', function() {
    try {
      if (currentPageType === 'exam') {
        showToast('当前处于答题界面中，只能提取题目', 'warning');
      } else {
        if (!expanded) {
          expanded = true;
          applyToggle(true);
          setToggleUI();
        }
      }

      const titleEl = document.querySelector('.header-title');
      const rawTitle = titleEl ? titleEl.textContent : '';
      const fileName = cleanTitle(rawTitle);

      const questions = extractQuestions();

      if (questions.length === 0) throw new Error('未解析到试题内容');

      const rows = [];

      rows.push(
        '<h2 style="font-family:宋体; font-size:18pt; color:#000000; text-align:center; margin:0 0 12pt 0;">' +
        esc(fileName) +
        '</h2>'
      );

      questions.forEach(function(q, idx) {
        const num = q.number || String(idx + 1);

        rows.push(
          '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
          esc(num + '.') +
          esc(q.stem) +
          '</p>'
        );

        q.options.forEach(function(opt) {
          rows.push(
            '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
            esc(opt) +
            '</p>'
          );
        });

        if (q.answer && currentPageType === 'result') {
          rows.push(
            '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
            '答案：' +
            esc(q.answer) +
            '</p>'
          );
        }
      });

      const html =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
        'xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<!--[if gte mso 9]>' +
        '<xml>' +
        '<w:WordDocument>' +
        '<w:View>Print</w:View>' +
        '<w:Zoom>100</w:Zoom>' +
        '</w:WordDocument>' +
        '</xml>' +
        '<![endif]-->' +
        '<style>' +
        '@page { size: 210mm 297mm; margin: 2.54cm; }' +
        'body { font-family: 宋体, "Times New Roman"; font-size: 12pt; color: #000000; }' +
        'p { margin: 0 0 6pt 0; }' +
        '</style>' +
        '</head>' +
        '<body>' +
        rows.join('') +
        '</body>' +
        '</html>';

      const blob = new Blob([html], {
        type: 'application/msword'
      });

      GM_download({
        url: URL.createObjectURL(blob),
        name: fileName + '.doc',
        saveAs: true,
        onload: function() {
          showToast('保存成功', 'success');
        },
        onerror: function() {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fileName + '.doc';
          a.click();
          showToast('保存成功', 'success');
        }
      });

    } catch (err) {
      console.error(err);
      showToast('导出失败：' + err.message, 'error');
    }
  });

  /* ---------- SPA 路由监听 ---------- */
  let navigationCheckInterval = null;

  function handlePageSwitch(newType) {
    if (newType === currentPageType) return;

    const oldType = currentPageType;
    currentPageType = newType;

    console.log('[RainExtract] 页面类型切换: ' + oldType + ' -> ' + newType);

    if (newType === 'exam') {
      const wasExpanded = !collapsed;
      if (wasExpanded) {
        collapse();
      }
      btnToggle.style.display = 'none';
      if (wasExpanded) {
        showToast('已切换到答题界面，RainExtract已自动收起', 'warning');
      }
    } else if (newType === 'result') {
      const wasCollapsed = collapsed;
      if (wasCollapsed) {
        expand();
      }
      btnToggle.style.display = '';
      if (wasCollapsed) {
        showToast('已切换到答题结果界面，RainExtract已自动展开');
      }
    }
  }

  window.addEventListener('popstate', function() {
    setTimeout(function() {
      handlePageSwitch(getPageType());
    }, 300);
  });

  window.addEventListener('hashchange', function() {
    setTimeout(function() {
      handlePageSwitch(getPageType());
    }, 300);
  });

  let lastPath = window.location.pathname + window.location.hash;
  navigationCheckInterval = setInterval(function() {
    const currentPath = window.location.pathname + window.location.hash;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      const newType = getPageType();
      handlePageSwitch(newType);
    }
  }, 1000);

  /* ---------- 初始化面板状态 ---------- */
  if (currentPageType === 'exam') {
    // 先禁用过渡动画避免初始化闪烁
    panel.style.transition = 'none';
    box.style.transition = 'none';
    box.classList.add('xtq-collapsed');
    // 强制回流后恢复动画
    panel.offsetHeight;
    panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    box.style.transition = 'border-radius 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.35s ease, box-shadow 0.35s ease, opacity 0.3s ease';

    btnToggle.style.display = 'none';
    // stickToEdge(false) 内部会正确处理过渡状态，这里保持transition为none
    panel.style.transition = 'none';
    stickToEdge(false);
    // 初始化完成后恢复位置过渡动画
    panel.style.transition = 'left 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    showToast('RainExtract 已启动（处于答题界面中，已自动收起）', 'warning');
  } else {
    expand();
    btnToggle.style.display = '';
    showToast('RainExtract 已启动');
  }

})();
