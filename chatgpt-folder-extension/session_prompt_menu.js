(function () {
    const optionsList = [
        { label: 'Normal', text: '※Balanced responses with natural flow;※' },
        { label: 'Concise', text: '※Shorter responses & more messages;※' },
        { label: 'Clear', text: '※Basic, Clear explanation that anyone can understand easily;※' },
        { label: 'Explanatory', text: '※Detailed responses & comprehensive context;※' },
        { label: 'Learning', text: '※Patient, educational responses that build understanding※' },
        { label: 'Formal', text: '※Clear and well-structured responses;※' }
    ];

    try {
        const slim = optionsList.map(o => ({ label: o.label, text: o.text }));
        sessionStorage.setItem('cgptPromptOptions', JSON.stringify(slim));
        window.__cgptPromptOptions = slim;
    } catch {}

    // 集中设置“默认 Normal”
    function __cgptSetDefaultNormal() {
        try {
            sessionStorage.setItem(
                'cgptSessionPrompt',
                JSON.stringify({ label: optionsList[0].label, text: optionsList[0].text })
            );
        } catch {}
    }

    // 首次进入页确保默认 Normal
    try { if (!sessionStorage.getItem('cgptSessionPrompt')) __cgptSetDefaultNormal(); } catch {}

    // 捕获“New chat”点击（全局/原生入口）
    document.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest(
            'button[aria-label="New chat"],a[data-testid="create-new-chat-button"]'
        );
        if (!btn) return; // 保持已选样式，不做重置
        // no-op
    }, true);


    function toast(msg) {
        try {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:24px;transform:translateX(-50%);background:#333;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
        } catch {}
    }

    // 读取/更新输入框处的 Prompt 胶囊
    const PILL_CLASS = 'cgpt-prompt-pill';

    function readStoredPromptLabel() {
        try {
            const raw = sessionStorage.getItem('cgptSessionPrompt');
            const obj = raw ? JSON.parse(raw) : null;
            return obj && typeof obj.label === 'string' ? obj.label.trim() : null;
        } catch { return null; }
    }

    // 构建胶囊元素，放在 + 按钮右侧
    function buildPill(label) {
        const pill = document.createElement('span');
        pill.className = PILL_CLASS;
        pill.setAttribute('data-label', String(label || ''));   // ← 新增：记录当前标签
        pill.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:6px',
            'margin-left:8px',
            'padding:4px 10px',
            'border-radius:12px',
            'font-size:15px',
            'line-height:1',
            'background:rgba(255,255,255,.08)',
            'color:inherit',
            'border:1px solid rgba(255,255,255,.12)',
            'user-select:none',
            'transform:scale(0.7)',
            'transform-origin:left center',
        ].join(';');

        /* —— 新增：light 模式白底浅描边 —— */
        if (document.documentElement.classList.contains('light')) {
            pill.style.background = '#fff';
            pill.style.border = '1px solid rgba(0,0,0,0.08)';
        }

        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M4 14.5c4-4.2 7.2-7 9.5-8.3.5-.3 1.2.2 1 .8-1 2.9-4 7.4-9.1 9.5-.6.2-1.2-.4-1-1z"></path></svg>';
        icon.style.opacity = '.85';

        const text = document.createElement('span');
        text.textContent = label;

        const close = document.createElement('button');

        close.type = 'button';
        close.textContent = '×';
        close.style.cssText = 'margin-left:4px;border:none;background:transparent;color:inherit;cursor:pointer;font-size:14px;line-height:1';

        // 点击 × 恢复到 Normal
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                sessionStorage.setItem('cgptSessionPrompt', JSON.stringify({ label: optionsList[0].label, text: optionsList[0].text }));
                toast('Start Prompt：off');
            } catch {}
            updatePromptPill();
        });

        pill.appendChild(icon);
        pill.appendChild(text);
        pill.appendChild(close);
        return pill;
    }

    /* === NEW: 迷你模型切换器 === */

// 迷你切换器容器类名
    const MINI_MODEL_CLASS = 'cgpt-mini-model-switcher';

// 映射常见项到 data-testid（用于“等同手动切换”点击）
    const MODEL_MAP = [
        { label: 'Auto',          testid: 'model-switcher-gpt-5' },
        { label: 'Instant',       testid: 'model-switcher-gpt-5-instant' },
        { label: 'Thinking mini', testid: 'model-switcher-gpt-5-t-mini' },
        { label: 'Thinking',      testid: 'model-switcher-gpt-5-thinking' },
        // { label: 'Pro',        testid: null }, // 页面可能为禁用项，保留但不绑定
        // Legacy
        { label: 'GPT-4o',        testid: 'model-switcher-gpt-4o',   group: 'legacy' },
        { label: 'GPT-4.1',       testid: 'model-switcher-gpt-4-1',  group: 'legacy' },
        { label: 'o3',            testid: 'model-switcher-o3',       group: 'legacy' },
        { label: 'o4-mini',       testid: 'model-switcher-o4-mini',  group: 'legacy' },
    ];

// 注入一次性样式：缩小外观、弹层样式
    (function ensureMiniModelStyle(){
        if (document.getElementById('cgpt-mini-model-style')) return;
        const s = document.createElement('style');
        s.id = 'cgpt-mini-model-style';
        s.textContent = `
      .${MINI_MODEL_CLASS}{
        display:inline-flex; align-items:center; margin-right:0px; transform:scale(.78);
        transform-origin:left center; position:relative; z-index:3;
      }
      .${MINI_MODEL_CLASS} > button{
        height:28px; padding:0 10px; border-radius:10px; border:1px solid rgba(0,0,0,.12);
        background:rgba(255,255,255,.08); font-size:14px; line-height:28px; cursor:pointer;
      }
      html.light .${MINI_MODEL_CLASS} > button{
        background:#fff; border-color:rgba(0,0,0,.08);
      }
      .${MINI_MODEL_CLASS}-menu{
        position:fixed; min-width:160px; max-height:360px; overflow:auto;
        background:var(--token-main-surface-primary,#2b2b2b); color:inherit;
        border-radius:12px; padding:6px 4px; box-shadow:0 10px 30px rgba(0,0,0,.25);
      }
      .${MINI_MODEL_CLASS}-item{
        display:flex; align-items:center; justify-content:space-between;
        gap:6px; padding:8px 10px; cursor:pointer; border-radius:8px;
      }
      .${MINI_MODEL_CLASS}-item:hover{
        background:rgba(255,255,255,.08);
      }
      html.light .${MINI_MODEL_CLASS}-menu{
        background:#fff; box-shadow:0 10px 30px rgba(0,0,0,.12);
      }
    `;
        document.head.appendChild(s);
    })();

// 找到页面顶部原生“模型选择”按钮
    function findHeaderModelButton(){
        const sel = 'button[data-testid="model-switcher-dropdown-button"],button[aria-label^="Model selector"]';
        const list = Array.from(document.querySelectorAll(sel));
        // 优先挑选“可见且有布局”的按钮，避免点到隐藏的移动端按钮
        const vis = list.find(b => b.offsetParent !== null &&
            b.getClientRects().length > 0 &&
            getComputedStyle(b).visibility !== 'hidden');
        // 回退：若未找到可见项，取最后一个（桌面版常在后）
        return vis || list[list.length - 1] || null;
    }

// 读取当前模型名，用于迷你按钮文案
    function readCurrentModelText(){
        const btn = findHeaderModelButton();
        if (!btn) return 'Model';
        const aria = btn.getAttribute('aria-label') || '';
        // 例： "Model selector, current model is 5 Instant"
        const m = aria.match(/current model is\s+(.+)$/i);
        if (m) return m[1].trim();
        const txt = (btn.textContent || '').trim();
        return txt || 'Model';
    }

// 打开并点击原生菜单的某项，使之“等同手动切换”
    function clickNativeModel(label){
        const headerBtn = findHeaderModelButton();
        if (!headerBtn) return;

        if (headerBtn.getAttribute('aria-expanded') !== 'true') {
            headerBtn.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));
            headerBtn.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
            headerBtn.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));
            headerBtn.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
            headerBtn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }

        const map = MODEL_MAP.find(m => m.label === label);

        // NEW: 如为“旧版模型”，先确保展开 Legacy 子菜单
        const openLegacySubmenuOnce = (() => {
            let done = false;
            return () => {
                if (done) return true;
                const sub = document.querySelector('[data-testid="Legacy models-submenu"]'); // 原生子菜单触发项
                if (!sub) return false; // 等待主菜单挂载
                sub.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));
                sub.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
                sub.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));
                sub.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
                sub.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                done = true;
                return true;
            };
        })();

        const pickTarget = () => {
            let el = map?.testid ? document.querySelector(`[data-testid="${map.testid}"]`) : null;
            if (!el) {
                el = Array.from(document.querySelectorAll('[role="menuitem"]'))
                    .find(n => (n.textContent || '').trim().toLowerCase().startsWith(label.toLowerCase()));
            }
            if (el && (el.offsetParent === null || el.getClientRects().length === 0)) el = null;
            return el || null;
        };

        let tried = 0;
        const tryClick = () => {
            const target = pickTarget();
            if (target) {
                target.scrollIntoView({block:'nearest'});
                target.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));
                target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
                target.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));
                target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
                target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                setTimeout(updateMiniModelText,160);
                return;
            }
            if (tried++ < 60) requestAnimationFrame(tryClick);
        };

        // NEW: legacy 先展开子菜单，再开始轮询点击目标项
        if (map?.group === 'legacy') {
            let subTries = 0;
            const ensureSubmenu = () => {
                // 若目标已出现则直接进入点击
                if (pickTarget()) { requestAnimationFrame(tryClick); return; }
                // 未出现则尝试展开一次子菜单
                openLegacySubmenuOnce();
                if (subTries++ < 15) requestAnimationFrame(ensureSubmenu);
                else requestAnimationFrame(tryClick); // 兜底仍尝试
            };
            requestAnimationFrame(ensureSubmenu);
        } else {
            requestAnimationFrame(tryClick);
        }
    }

// 计算弹层位置：自动上/下翻转
    function placeMenu(menuEl, anchorRect){
        // 先临时显示以获得尺寸
        menuEl.style.visibility = 'hidden';
        document.body.appendChild(menuEl);
        const mh = menuEl.offsetHeight || 260;
        const mw = Math.max(menuEl.offsetWidth, 180);
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const spaceAbove = anchorRect.top;
        const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

        const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - mw - 8);
        const top  = openUp ? (anchorRect.top - mh - 8) : (anchorRect.bottom + 6);

        menuEl.style.left = `${left}px`;
        menuEl.style.top  = `${top}px`;
        menuEl.style.visibility = '';
        return openUp ? 'top' : 'bottom';
    }

// 构建迷你按钮
    function buildMiniModelSwitcher(){
        const wrap = document.createElement('span');
        wrap.className = MINI_MODEL_CLASS;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-haspopup', 'menu');
        btn.textContent = readCurrentModelText();
        wrap.appendChild(btn);

        let openedMenu = null;

        const openMenu = () => {
            if (openedMenu) { closeMenu(); return; }
            const m = document.createElement('div');
            m.className = `${MINI_MODEL_CLASS}-menu`;
            MODEL_MAP.forEach(opt => {
                const row = document.createElement('div');
                row.className = `${MINI_MODEL_CLASS}-item`;
                row.textContent = opt.label;
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeMenu();
                    clickNativeModel(opt.label);
                });
                m.appendChild(row);
            });
            // 定位
            const r = btn.getBoundingClientRect();
            placeMenu(m, r);
            openedMenu = m;

            setTimeout(() => {
                const closer = (ev) => {
                    if (!m.contains(ev.target)) { closeMenu(); document.removeEventListener('click', closer, true); }
                };
                document.addEventListener('click', closer, true);
            }, 0);
        };

        const closeMenu = () => {
            if (openedMenu) { try { openedMenu.remove(); } catch{} openedMenu = null; }
        };

        btn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });

        return wrap;
    }

// 确保迷你切换器已插入；并尽量紧跟在胶囊或“+”按钮之后
    function ensureMiniModelSwitcher(host, plusBtn, pillEl){
        let mini = host.querySelector('.' + MINI_MODEL_CLASS);
        if (!mini) {
            mini = buildMiniModelSwitcher();
            const anchor = pillEl || host.querySelector('.' + PILL_CLASS) || plusBtn;
            host.insertBefore(mini, anchor.nextSibling);
        } else {
            updateMiniModelText(mini);
        }
    }

// 更新按钮文案（当前模型）
    function updateMiniModelText(mini){
        const root = mini || document.querySelector('.' + MINI_MODEL_CLASS);
        if (!root) return;
        const btn = root.querySelector('button');
        if (!btn) return;
        btn.textContent = readCurrentModelText();
    }

// 监听顶部模型按钮变化，自动刷新文案
    (function observeHeaderModel(){
        const btn = findHeaderModelButton();
        if (!btn || btn.__cgptMiniModelObserved) return;
        const mo = new MutationObserver(() => updateMiniModelText());
        mo.observe(btn, { attributes:true, childList:true, subtree:true });
        btn.__cgptMiniModelObserved = true;
    })();


    // 【修改版】在插入胶囊后，顺带插入迷你“模型切换器”
    function updatePromptPill() {
        const label = readStoredPromptLabel();
        const shouldShow = optionsList
            .filter(opt => opt.label !== 'Normal')
            .some(opt => opt.label === label);

        const plusButtons = Array.from(document.querySelectorAll('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]'));
        plusButtons.forEach(btn => {
            const host = btn && btn.parentElement;
            if (!host) return;

            const existed = host.querySelector('.' + PILL_CLASS);

            if (!shouldShow) {
                if (existed) existed.remove();
                // NEW: 如果胶囊隐藏，也要确保模型切换器存在（与胶囊同行，但不依赖胶囊显示）
                ensureMiniModelSwitcher(host, btn);
                return;
            }

            if (existed) {
                const current = existed.getAttribute('data-label') || '';
                if (current !== String(label || '')) {
                    const textNode = existed.querySelector('span:nth-of-type(2)');
                    if (textNode) textNode.textContent = label || '';
                    existed.setAttribute('data-label', String(label || ''));
                }
                // NEW: 胶囊已存在时，也确保模型切换器存在并更新当前模型文案
                ensureMiniModelSwitcher(host, btn);
                return;
            }

            const pill = buildPill(label);
            host.insertBefore(pill, btn.nextSibling);
            // NEW: 插入胶囊后，紧跟插入迷你模型切换器
            ensureMiniModelSwitcher(host, btn, pill);
        });
    }





    // 观察下拉菜单出现，并注入「Prompt」入口
    const mo = new MutationObserver((mutations) => {
        const patchGroup = (g) => {
            if (!g || g.__cgptPromptMenuPatched) return;

            const firstItem = g.querySelector('div[role="menuitem"]');
            if (!firstItem) return;

            /* NEW: 通过菜单根节点 → aria-labelledby → 触发器，确认是否为“输入框 +”菜单 */
            const menuRoot =
                g.closest('[role="menu"][data-radix-menu-content]') || g.closest('[role="menu"]');

            let isFromPlus = false;
            if (menuRoot) {
                const triggerId = menuRoot.getAttribute('aria-labelledby');
                const triggerEl = triggerId ? document.getElementById(triggerId) : null;

                // 触发器就是 “+” 按钮，或其内部元素
                const matchPlus = sel =>
                    triggerEl && (triggerEl.matches?.(sel) || triggerEl.closest?.(sel));

                isFromPlus = !!matchPlus('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]');

                // 兜底：若触发器不可用，则用 plus 按钮的 aria-controls 对齐菜单 id
                if (!isFromPlus && menuRoot.id) {
                    const plusBtn = document.querySelector('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]');
                    const controls = plusBtn?.getAttribute('aria-controls') || '';
                    if (controls.split(/\s+/).includes(menuRoot.id)) isFromPlus = true;
                }
            }

            if (!isFromPlus) return;

            const mi = document.createElement('div');
            mi.setAttribute('role', 'menuitem');
            mi.setAttribute('tabindex', '0');
            mi.className = 'group __menu-item gap-1.5';
            mi.style.cursor = 'pointer';

            const icon = document.createElement('div');
            icon.className = 'flex items-center justify-center icon';
            icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M4 10h12v1.5H4zM4 6.5h12V8H4zM4 13.5h9V15H4z"/></svg>';

            const text = document.createElement('div');
            text.className = 'flex min-w-0 grow items-center gap-2.5';
            text.innerHTML = '<div class="truncate">Use style</div>';

            mi.appendChild(icon);
            mi.appendChild(text);

            mi.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;z-index:2147483647;min-width:160px;background:#2b2b2b;color:#e7d8c5;border-radius:8px;padding:6px 0;box-shadow:0 4px 10px rgba(0,0,0,2)';
                const rect = mi.getBoundingClientRect();
                pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 180)) + 'px';
                pop.style.top  = (rect.bottom + 6) + 'px';

                const storedPrompt = (() => { try {
                    const raw = sessionStorage.getItem('cgptSessionPrompt');
                    return raw ? JSON.parse(raw) : null;
                } catch { return null; } })();
                const currentLabel = (storedPrompt && typeof storedPrompt.label === 'string')
                    ? String(storedPrompt.label).trim() : null;

                optionsList.forEach(o => {
                    const row = document.createElement('div');
                    row.textContent = String(o.label || '').trim() || 'Unnamed';
                    row.style.cssText = 'padding:6px 12px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:space-between';
                    if (currentLabel && String(o.label).trim() === currentLabel) {
                        row.style.background = 'rgba(255,255,255,0.08)';
                        const tick = document.createElement('span');
                        tick.textContent = '√';
                        tick.style.cssText = 'margin-left:8px;opacity:.8';
                        row.appendChild(tick);
                    }
                    row.addEventListener('click', (e2) => {
                        e2.stopPropagation();
                        try {
                            const chosen = String(o.label || '').trim();
                            const isSame = currentLabel && chosen === currentLabel;
                            if (isSame) {
                                // 关闭：清理所有一次性 / 周期标记
                                sessionStorage.removeItem('cgptSessionPrompt');
                                try {
                                    sessionStorage.removeItem('cgptPromptStyleSwitchPending');
                                    sessionStorage.removeItem('cgptPromptStyleCrossToken');  // ← 清理周期 token
                                    sessionStorage.removeItem('cgptCrossLastPath');          // ← 清理上次路径
                                } catch {}
                                toast('Start Prompt：off');
                            } else {
                                // 切换到不同样式：本会话一次性 + 跨会话“按切换动作”触发
                                sessionStorage.setItem('cgptSessionPrompt', JSON.stringify({ label: o.label, text: o.text }));
                                try {
                                    sessionStorage.setItem('cgptPromptStyleSwitchPending', '1');                 // 本会话首次插入
                                    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                                    sessionStorage.setItem('cgptPromptStyleCrossToken', token);                  // ← 周期 token
                                    sessionStorage.setItem('cgptCrossLastPath', location.pathname || '');        // ← 记住当前路径
                                } catch {}
                                toast('Start Prompt：' + (chosen || 'Unnamed'));
                            }
                        } catch {}
                        pop.remove();
                        updatePromptPill();
                    });



                    pop.appendChild(row);
                });

                document.body.appendChild(pop);
                setTimeout(() => {
                    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close, true); } };
                    document.addEventListener('click', close, true);
                }, 0);
            });

            const anchor = g.querySelector('div[role="menuitem"]');
            if (anchor && anchor.parentNode === g) g.insertBefore(mi, anchor);
            else g.appendChild(mi);

            g.__cgptPromptMenuPatched = true;
        };

        // 保持原逻辑，并在 DOM 有新增时轻量刷新一次胶囊
        let needRefresh = false;
        for (const m of mutations) {
            if (m.type !== 'childList') continue;
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches?.('div[role="group"]')) patchGroup(node);
                node.querySelectorAll?.('div[role="group"]').forEach(patchGroup);

                // 新增：直接监听 plus 按钮出现，避免只等表单节点
                if (!needRefresh && (
                    node.matches?.('[data-testid="composer-plus-btn"]') ||
                    node.querySelector?.('[data-testid="composer-plus-btn"]')
                )) {
                    needRefresh = true;
                } else if (!needRefresh && node.querySelector?.('form[data-type="unified-composer"]')) {
                    needRefresh = true;
                }
            });
        }
        if (needRefresh) requestAnimationFrame(updatePromptPill);
    });
    const __start = () => {
        mo.observe(document.body, { childList:true, subtree:true });
        requestAnimationFrame(updatePromptPill);
    };
    if (document.readyState === 'complete') {
        (window.requestIdleCallback || (cb=>setTimeout(cb,120)))(__start);
    } else {
        window.addEventListener('load', () => (
            window.requestIdleCallback || (cb=>setTimeout(cb,120))
        )(__start), { once:true, passive:true });
    }

    window.addEventListener('storage', (e) => {
        if (e.key === 'cgptSessionPrompt') updatePromptPill();
    }, { passive: true });

    window.addEventListener('pagehide', () => { try { mo.disconnect(); } catch {} }, { passive: true });
})();
