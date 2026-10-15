// ==UserScript==
// @name         RainExtract
// @namespace    https://examination.xuetangx.com
// @version      4.2.10
// @description  One-click expand all explanations and download exam questions with images. Supports both PC and mobile (h5) exam pages. Auto-detects device type. SPA navigation aware. Image support. Embeds images as base64. Fixed: floating ball click not responding on exam page. Fixed: iOS Safari/Edge download (safeDownload fallback); PC uses GM_download for reliable cancel/toast handling.
// @author By Qwen3.7
// @match        https://examination.xuetangx.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

  /* ---------- GM API Shim（兼容非Tampermonkey环境） ---------- */
  if (typeof GM_addStyle !== 'function') {
    window.GM_addStyle = function(css) {
      try {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.textContent = css;
        document.head.appendChild(style);
      } catch(e) {
        console.error('[RainExtract] GM_addStyle shim failed:', e);
      }
    };
  }
    /* ---------- GM_download Shim（兼容非Tampermonkey环境）---------- */
  if (typeof GM_download !== 'function') {
    window.GM_download = function(opts) {
      console.log('[RainExtract] GM_download shim called, url=' + opts.url + ', name=' + opts.name);
      try {
        var a = document.createElement('a');
        a.href = opts.url;
        a.download = opts.name || 'download';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (opts.onload) opts.onload();
      } catch(e) {
        console.error('[RainExtract] GM_download shim failed:', e);
        if (opts.onerror) opts.onerror();
      }
    };
  }

/* ---------- iOS兼容下载函数（不依赖GM_download，直接实现多策略降级） ---------- */
  function safeDownload(blob, fileName) {
    console.log('[RainExtract] safeDownload被调用, fileName=' + fileName + ', blob.size=' + blob.size);
    // 检测iOS（包括iPad iOS13+）
    var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOS) {
      // ========== iOS专用下载策略（仅data URL下载，无分享）==========
      safeDownloadDataUrl(blob, fileName);
    } else {
      // ========== 非iOS浏览器：标准下载 ==========
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName || 'download';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('保存成功', 'success');
      } catch(e) {
        console.error('[RainExtract] 非iOS下载失败:', e);
        safeDownloadDataUrl(blob, fileName);
      }
    }
  }
  
  /* iOS辅助函数：通过data URL方式下载 */
  function safeDownloadDataUrl(blob, fileName) {
    console.log('[RainExtract] 尝试dataUrl方式下载');
    var reader = new FileReader();
    reader.onloadend = function() {
      var dataUrl = reader.result;
      console.log('[RainExtract] dataUrl生成成功, 长度=' + (dataUrl ? dataUrl.length : 'null'));
      
      if (dataUrl) {
        // 方法1: 创建隐藏的<a download>元素触发下载
        try {
          var a = document.createElement('a');
          a.href = dataUrl;
          a.download = fileName || 'download';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(function() {
            try { document.body.removeChild(a); } catch(e) {}
          }, 100);
          showToast('保存成功', 'success');
          return;
        } catch(e) {
          console.log('[RainExtract] <a download>方式失败:', e.message || e);
          // 兜底: 复制到剪贴板
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              var textBlob = new Blob([blob], { type: 'text/plain;charset=utf-8' });
              var textReader = new FileReader();
              textReader.onloadend = function() {
                navigator.clipboard.writeText(textReader.result || '').then(function() {
                  showToast('已无法自动下载文件，内容已复制到剪贴板，请粘贴保存到记事本', 'error');
                }).catch(function() {
                  showToast('请截图保存页面内容', 'error');
                });
              };
              textReader.readAsText(textBlob);
            } else {
              showToast('请截图保存页面内容', 'error');
            }
          } catch(e2) {
            showToast('请截图保存页面内容', 'error');
          }
        }
      } else {
        console.error('[RainExtract] dataUrl为空');
        showToast('下载失败，请截图保存页面内容', 'error');
      }
    };
    reader.onerror = function() {
      console.error('[RainExtract] FileReader读取blob失败');
      showToast('下载失败，请截图保存页面内容', 'error');
    };
    reader.readAsDataURL(blob);
  }
  /* String.prototype.replaceAll polyfill */
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(str, newStr) {
      if (str === '') return this.replace(new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newStr);
      return this.replace(new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newStr);
    };
  }
  if (typeof fetch !== 'function') {
    console.warn('[RainExtract] fetch not available, image embedding disabled');
  }


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

  /* ---------- 移动端检测 ---------- */
  function isMobile() {
    // 方法1: 检查URL路径是否包含/h5/
    if (window.location.pathname.indexOf('/h5/') !== -1) {
      return true;
    }
    // 方法2: 检查是否加载了mobile-specific CSS (h5.*.css)
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var href = sheets[i].href || '';
        if (href.indexOf('h5.') !== -1) {
          return true;
        }
      }
    } catch(e) {}
    // 方法3: 检查html元素的style（移动端font-size通常是53.333px）
    try {
      var htmlStyle = document.documentElement.style;
      if (htmlStyle.fontSize && htmlStyle.fontSize.indexOf('53.333') !== -1) {
        return true;
      }
    } catch(e) {}
    // 方法4: 检查是否有exam-main--body（移动端特有类）
    if (document.querySelector('.exam-main--body')) {
      return true;
    }
    return false;
  }

  /* ---------- 移动端选择器适配 ---------- */
  function getSelectors() {
    var mobile = isMobile();
    if (mobile) {
      return {
        // 移动端容器
        container: '.exam-main--body',
        // 移动端题目项（手机版不区分exercise-item和result_item，统一用subject-item）
        examItems: '.exam-main--body .subject-item',
        resultItems: '.exam-main--body .subject-item',
        // 公共选择器
        footer: '.item-footer',
        footerBody: '.item-footer--body',
        footerHeader: '.item-footer--header',
        footerMore: '.item-footer--more',
        // 移动端选项容器（不包裹在ul.list-unstyled中）
        optionsContainer: '.list-unstyled-radio',
        optionsContainerCheckbox: '.list-unstyled-checkbox',
        // 移动端选项内元素
        radioInput: '.radioInput',
        radioText: '.radioText',
        checkboxInput: '.checkboxInput',
        checkboxText: '.checkboxText',
        // 题目内容
        itemType: '.item-type',
        itemBody: '.item-body',
        examFont: '.exam-font',
        // 标题
        headerTitle: '.header-title',
        // 移动端h4结构
        itemBodyH4: '.item-body h4',
      };
    } else {
      return {
        // PC端容器
        container: '.exam-main--content',
        // PC端题目项（区分exercise-item和result_item）
        examItems: '.exam-main--content .subject-item .exercise-item',
        resultItems: '.exam-main--content .subject-item .result_item',
        // 公共选择器
        footer: '.item-footer',
        footerBody: '.item-footer--body',
        footerHeader: '.item-footer--header',
        footerMore: '.item-footer--more',
        // PC端选项容器（包裹在ul.list-unstyled中）
        optionsContainer: '.item-body ul.list-unstyled.list-unstyled-radio',
        optionsContainerCheckbox: '.item-body ul.list-unstyled.list-unstyled-checkbox',
        // PC端选项内元素
        radioInput: '.radioInput',
        radioText: '.radioText',
        checkboxInput: '.checkboxInput',
        checkboxText: '.checkboxText',
        // 题目内容
        itemType: '.item-type',
        itemBody: '.item-body',
        examFont: '.exam-font',
        // 标题
        headerTitle: '.header-title',
        // PC端h4结构
        itemBodyH4: '.item-body h4',
      };
    }
  }

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
    // 【修复】不在这里调用 preventDefault，避免在某些浏览器中抑制 click 事件
    // preventDefault 移到 moveDrag 中，仅在实际拖动时调用
  }

  function moveDrag(e) {
    if (!dragging) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    // 阈值：移动超过5px才算拖动
    if (!dragStarted && (dx > 5 || dy > 5)) {
      dragStarted = true;
      e.preventDefault();  // 【修复】仅在实际拖动时阻止默认行为，不影响点击事件
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
    var sel = getSelectors();
    var footerBodySelector = sel.footer + ' ' + sel.footerBody;
    if (currentPageType === 'exam') {
      return Array.from(
        document.querySelectorAll(sel.examItems + ' ' + footerBodySelector)
      );
    }
    return Array.from(
      document.querySelectorAll(sel.resultItems + ' ' + footerBodySelector)
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

  
    /* ---------- HTML清理函数：移除块级标签但保留内容和inline标签/图片 ---------- */
  function cleanHtmlForOutput(html) {
    if (!html) return '';
    // 移除<p>和</p>标签（保留内容）
    html = html.replace(/<\s*p\s*>/gi, '');
    html = html.replace(/<\s*\/\s*p\s*>/gi, '');
    // 移除<br>和<br/>标签
    html = html.replace(/<\s*br\s*\/?>/gi, '');
    // 移除<div>和</div>标签（保留内容）
    html = html.replace(/<\s*div\s*>/gi, '');
    html = html.replace(/<\s*\/\s*div\s*>/gi, '');
    // 移除<blockquote>和</blockquote>标签（保留内容）
    html = html.replace(/<\s*blockquote\s*>/gi, '');
    html = html.replace(/<\s*\/\s*blockquote\s*>/gi, '');
    return html.trim();
  }
/* ---------- 图片转Base64：将HTML中的远程图片URL替换为base64 data URI ---------- */
  function convertRemoteImagesToBase64(htmlString) {
    return new Promise(function(resolve) {
      // 创建临时DOM来解析HTML并查找img标签
      var parser = new DOMParser();
      var doc = parser.parseFromString('<div class="tmp-container">' + htmlString + '</div>', 'text/html');
      var imgs = doc.querySelectorAll('img');
      var remoteUrls = [];

      // 收集所有远程URL（排除data:URI和相对路径）
      imgs.forEach(function(img) {
        var src = img.getAttribute('src');
        if (src && src.indexOf('http://') === 0 || (src && src.indexOf('https://') === 0)) {
          remoteUrls.push(src);
        }
      });

      // 如果没有远程图片，直接返回原HTML
      if (remoteUrls.length === 0) {
        resolve(htmlString);
        return;
      }

      // 去重
      var uniqueUrls = Array.from(new Set(remoteUrls));
      var promises = uniqueUrls.map(function(url) {
        return fetch(url, { mode: 'cors' })
          .then(function(response) {
            return response.blob();
          })
          .then(function(blob) {
            return new Promise(function(resolver, reject) {
              var reader = new FileReader();
              reader.onloadend = function() {
                resolver({ url: url, base64: reader.result });
              };
              reader.onerror = function() {
                // 读取失败，保留原始URL
                resolver({ url: url, base64: null });
              };
              reader.readAsDataURL(blob);
            });
          })
          .catch(function() {
            // fetch失败，保留原始URL
            return { url: url, base64: null };
          });
      });

      Promise.all(promises).then(function(results) {
        var newHtml = htmlString;
        results.forEach(function(result) {
          if (result.base64) {
            // 替换所有该URL的实例（包括URL编码形式）
            newHtml = newHtml.split(result.url).join(result.base64);
          }
        });
        resolve(newHtml);
      });
    });
  }

  /* ---------- 提取试题数据 ---------- */
  
  /* Image helpers */
  function getStemHtml(item) {
    var s = getSelectors();
    var h = item.querySelector(s.itemBodyH4);
    var rawHtml = '';
    if (h) {
      var u = h.querySelector('.custom_ueditor_cn_body');
      if (u) rawHtml = u.innerHTML;
      else rawHtml = h.innerHTML;
    }
    if (!rawHtml) {
      var e = item.querySelector(s.itemBody + ' ' + s.examFont);
      if (e) {
        var u2 = e.querySelector('.custom_ueditor_cn_body');
        if (u2) rawHtml = u2.innerHTML;
      }
    }
    if (!rawHtml) return Promise.resolve('');
    // 将远程图片转为base64
    return convertRemoteImagesToBase64(rawHtml);
  }
  function getOptHtml(label) {
    var r = label.querySelector('.radioText');
    if (r) {
      var u = r.querySelector('.custom_ueditor_cn_body');
      if (u) {
        // 将远程图片转为base64
        return convertRemoteImagesToBase64(u.innerHTML);
      }
      return Promise.resolve(r.innerHTML);
    }
    return Promise.resolve('');
  }
  function getStemText(item) {
    var s = getSelectors();
    var t = item.querySelector(s.itemBody + ' ' + s.examFont + ' p');
    if (!t || !t.textContent.trim()) {
      t = item.querySelector(s.itemBody + ' .clearfix' + s.examFont);
    }
    if (!t || !t.textContent.trim()) {
      var h = item.querySelector(s.itemBodyH4);
      if (h) t = h.querySelector('p');
    }
    return t ? t.textContent.trim() : '';
  }
async function extractQuestions() {
    try {
      var sel = getSelectors();
      var examMain = document.querySelector('.app-container ' + sel.container);
      if (!examMain) {
        examMain = document.querySelector(sel.container);
      }
      if (!examMain) throw new Error('未找到试题区域');
      var items;
      if (currentPageType === 'exam') {
        items = Array.from(examMain.querySelectorAll(sel.examItems));
      } else {
        items = Array.from(examMain.querySelectorAll(sel.resultItems));
      }
      if (items.length === 0) throw new Error('未找到试题');
      console.log('[RainExtract] 找到 ' + items.length + ' 道试题');
      var questions = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var q = {};
        var typeEl = item.querySelector(sel.itemType);
        if (typeEl) {
          var raw = typeEl.textContent.trim();
          var num = parseNumberPrefix(raw);
          q.number = num || '';
        }
        q.stemHtml = await getStemHtml(item);
        q.stem = getStemText(item) || q.stemHtml.replace(/<img[^>]*>/g, '[Image]').replace(/<[^>]+>/g, '').trim();
        q.options = [];
        var ul = item.querySelector(sel.optionsContainer);
        if (ul) {
          var lis = Array.from(ul.querySelectorAll(':scope > li'));
          for (var j = 0; j < lis.length; j++) {
            var li = lis[j];
            var label = li.querySelector('label');
            if (!label) continue;
            var radioInput = label.querySelector(sel.radioInput);
            var radioTextEl = label.querySelector(sel.radioText + ' p');
            if (!radioTextEl) {
              radioTextEl = label.querySelector(sel.radioText);
            }
            var letter = radioInput ? radioInput.textContent.trim() : '';
            var oHtml = await getOptHtml(label);
            var oText = radioTextEl ? radioTextEl.textContent.trim() : '';
            if (letter && (oHtml || oText)) {
              q.options.push({l: letter, h: oHtml || '', t: oText});
            }
          }
        }
        q.answer = '';
        if (currentPageType === 'result') {
          var footer = item.querySelector(sel.footer);
          if (footer) {
            var bodyEl = footer.querySelector(sel.footerBody);
            if (bodyEl) {
              q.answer = bodyEl.textContent.trim();
            }
            if (!q.answer) {
              var header = footer.querySelector(sel.footerHeader);
              if (header) {
                var spans = Array.from(header.querySelectorAll('span'));
                for (var k = 0; k < spans.length; k++) {
                  var t = spans[k].textContent.trim();
                  if (t && t !== '正确答案：') {
                    q.answer = t;
                  }
                }
              }
            }
          }
        }
        questions.push(q);
      }
      console.log('[RainExtract] 成功提取 ' + questions.length + ' 道试题');
      return questions;
    } catch (err) {
      console.error('[RainExtract] extractQuestions error:', err);
      throw err;
    }
  }

  /* ---------- 功能2：保存试题 ---------- */
  btnSave.addEventListener('click', async function() {
    try {
      console.log('[RainExtract] 保存按钮被点击, currentPageType=' + currentPageType);
      if (currentPageType === 'exam') {
        showToast('当前处于答题界面中，只能提取题目', 'warning');
      } else {
        if (!expanded) {
          expanded = true;
          applyToggle(true);
          setToggleUI();
        }
      }

      // 获取选择器（用于移动端兼容）
      var selBtn = getSelectors();
      const titleEl = document.querySelector(selBtn.headerTitle);
      const rawTitle = titleEl ? titleEl.textContent : '';
      const fileName = cleanTitle(rawTitle);

      const questions = await extractQuestions();

      if (questions.length === 0) throw new Error('未解析到试题内容');

      const rows = [];

      rows.push(
        '<h2 style="font-family:宋体; font-size:18pt; color:#000000; text-align:center; margin:0 0 12pt 0;">' +
        esc(fileName) +
        '</h2>'
      );

      questions.forEach(function(q, idx) {
        const num = q.number || String(idx + 1);

        // Output stem (with images if available)
        if (q.stemHtml) {
          rows.push(
            '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
            esc(num + '.') + cleanHtmlForOutput(q.stemHtml) +
            '</p>'
          );
        } else {
          rows.push(
            '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
            esc(num + '.') + esc(q.stem) +
            '</p>'
          );
        }
        // Output options (with images if available)
        q.options.forEach(function(opt) {
          if (opt.h) {
            rows.push(
              '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
              esc(opt.l) + '.' + cleanHtmlForOutput(opt.h) +
              '</p>'
            );
          } else {
            rows.push(
              '<p style="font-family:宋体; font-size:12pt; color:#000000; margin:0 0 6pt 0;">' +
              esc(opt.l + '.' + opt.t) +
              '</p>'
            );
          }
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

      // PC端使用GM_download（Tampermonkey原生API，正确处理取消和toast）
      // iOS端使用safeDownload（兼容iOS Edge）
      var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        // iOS: 使用自定义下载（GM_download在iOS Edge上可能不工作）
        console.log('[RainExtract] iOS环境，使用safeDownload');
        safeDownload(blob, fileName + '.doc');
      } else {
        // PC: 使用GM_download（Tampermonkey/Violentmonkey原生API，处理下载/取消/toast最可靠）
        console.log('[RainExtract] PC环境，使用GM_download');
        window.GM_download({
          url: URL.createObjectURL(blob),
          name: fileName + '.doc',
          saveAs: true,
          onload: function() {
            console.log('[RainExtract] GM_download onload');
            showToast('保存成功', 'success');
          },
          onerror: function() {
            console.log('[RainExtract] GM_download onerror，降级到safeDownload');
            safeDownload(blob, fileName + '.doc');
          }
        });
      }

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
  console.log('[RainExtract] 初始化开始, currentPageType=' + currentPageType + ', isMobile=' + (typeof isMobile === 'function' ? isMobile() : 'N/A'));
  if (currentPageType === 'exam') {
    // 先禁用过渡动画避免初始化闪烁
    panel.style.transition = 'none';
    box.style.transition = 'none';
    box.classList.add('xtq-collapsed');
    collapsed = true;  // 【修复】同步JS变量与CSS类状态
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
