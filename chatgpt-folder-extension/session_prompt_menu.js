(function () {
    const optionsList = [
        { label: 'Normal', text: '※Balanced responses with natural flow;※' },
        { label: 'Concise', text: '※Shorter responses & more messages;※' },
        { label: 'Clear', text: '※Clear explanation that anyone can understand easily;※' },
        { label: 'Explanatory', text: '※Detailed responses & comprehensive context;※' },
        { label: 'Learning', text: '※Patient, educational responses that build understanding※' },
        { label: 'Formal', text: '※Clear and well-structured responses;※' }
    ];

    try {
        const slim = optionsList.map(o => ({ label: o.label, text: o.text }));
        sessionStorage.setItem('cgptPromptOptions', JSON.stringify(slim));
        window.__cgptPromptOptions = slim;
    } catch {}

    // NEW: Beginner Mode 默认开启（'1'=on, '0'=off）
    try { if (sessionStorage.getItem('cgptBeginnerMode') === null) {
        sessionStorage.setItem('cgptBeginnerMode', '0');
    } } catch {}

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

    function __cgptReadDefaultModelLabel(){
        try { return localStorage.getItem('cgptDefaultModelLabel') || ''; } catch { return ''; }
    }

    document.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest(
            'button[aria-label="New chat"],a[data-testid="create-new-chat-button"]'
        );
        if (!btn) return;

        const label = __cgptReadDefaultModelLabel();
        if (!label) return;

        const apply = async () => {
            if (!MODEL_MAP.length) { try { await __cgptReloadModelMap(); } catch {} }
            clickNativeModel(label);   // 内部已处理展开/查找/点击与回退重试 :contentReference[oaicite:9]{index=9}
        };
        // 多次定时触发，覆盖导航与菜单渲染的时序抖动
        setTimeout(apply, 300);
    }, true);

// 捕获“历史会话”点击，清除强制模型锁，并在切换后同步
    document.addEventListener('click', (ev) => {
        const a = ev.target && ev.target.closest(
            'a[href^="/c/"],a[data-testid="conversation-item"],[data-testid="conversation-item"] a'
        );
        if (!a) return;
        setTimeout(() => { updateMiniModelText(); ensureHeaderModelObserved(); }, 600);
    }, true);

    const PILL_CLASS = 'cgpt-prompt-pill';

    function toast(msg) {
        try {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:24px;transform:translateX(-50%);background:#333;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
        } catch {}
    }



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
            'height:25px',
            'gap:6px',
            'margin-left:8px',
            'margin-top:4px',
            'padding:2px 8px',
            'border-radius:9px',
            'font-size:12px',
            'line-height:1',
            'background:rgba(255,255,255,.08)',
            'color:inherit',
            'border:1px solid rgba(255,255,255,.12)',
            'user-select:none'
        ].join(';');

        /* —— 新增：light 模式白底浅描边 —— */
        if (document.documentElement.classList.contains('light')) {
            pill.style.background = '#fff';
            pill.style.border = '1px solid rgba(0,0,0,0.08)';
        }

        try {
            const isBeginner = sessionStorage.getItem('cgptBeginnerMode') !== '0';
            if (isBeginner) {
                pill.style.background = 'rgb(169,181,194)'; // 169,181,194
                pill.style.color = '#111';
            }
        } catch {}

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

        pill.appendChild(text);
        pill.appendChild(close);
        return pill;
    }

    const MINI_MODEL_CLASS = 'cgpt-mini-model-switcher';

    let MODEL_MAP = [];

    function __cgptBuildAcceptLanguage() {
        const ls = (Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages : [navigator.language || 'en-US'])
            .map(s => String(s || '').split(';')[0]).filter(Boolean);
        const uniq = [...new Set(ls)].slice(0, 4);
        if (!uniq.length) return 'en-US,en;q=0.9';
        const qs = [1.0, 0.9, 0.8, 0.7];
        return uniq.map((l, i) => i === 0 ? l : `${l};q=${qs[i].toFixed(1)}`).join(',');
    }
    async function __cgptGetAuthHeaders() {
        const h = { accept: '*/*', 'accept-language': __cgptBuildAcceptLanguage(), 'content-type': 'application/json' };
        try {
            const r = await fetch('/api/auth/session', { credentials: 'same-origin' });
            if (r.ok) {
                const j = await r.json();
                if (j && j.accessToken) h.authorization = `Bearer ${j.accessToken}`;
            }
        } catch {}
        return h;
    }

// 拉取并重建 MODEL_MAP：使用 categories[*]
    async function __cgptReloadModelMap() {
        try {
            const headers = await __cgptGetAuthHeaders();
            const res = await fetch('/backend-api/models?is_gizmo=false', { headers, credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            const cats = Array.isArray(data?.categories) ? data.categories : [];
            const next = cats.map(c => ({
                label: c?.human_category_short_name || '',
                testid: c?.default_model ? `model-switcher-${c.default_model}` : null,
                // group: c?.subcategory === 'Legacy models' ? 'legacy' : undefined,
            })).filter(x => x.label && x.testid);

            // 去重（按 label）
            const seen = new Set();
            MODEL_MAP = next.filter(x => (seen.has(x.label) ? false : (seen.add(x.label), true)));

        } catch {}
    }


    (function ensureMiniModelStyle(){
        if (document.getElementById('cgpt-mini-model-style')) return;
        const s = document.createElement('style');
        s.id = 'cgpt-mini-model-style';
        s.textContent = `
              .${MINI_MODEL_CLASS}{
                display:inline-flex; align-items:center; margin-left:8px; margin-right:0px;
                position:relative; z-index:3;
              }
              .${MINI_MODEL_CLASS} > button{
                /* 用真实尺寸，避免布局与视觉不一致 */
                height:28px; padding:0 8px; border-radius:10px; border:1px solid rgba(0,0,0,.12);
                background:rgba(255,255,255,.08); font-size:12px; line-height:26px; cursor:pointer;
              }
              html.light .${MINI_MODEL_CLASS} > button{
                background:#fff; border-color:rgba(0,0,0,.08);
              }
              .${MINI_MODEL_CLASS}-menu{
                position:fixed; min-width:160px; max-height:360px; overflow:auto;
                background:var(--token-main-surface-primary,#2b2b2b); color:inherit;
                border-radius:12px; padding:6px 4px; box-shadow:0 10px 30px rgba(0,0,0,.25);
              }
              /* NEW: light 模式下将迷你模型切换器弹框设为浅灰底 */
              html.light .${MINI_MODEL_CLASS}-menu{
                background:#f5f5f5;
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

    function readCurrentModelText(){
        const btn = findHeaderModelButton();
        if (!btn) return 'Model';
        const aria = btn.getAttribute('aria-label') || '';
        const m = aria.match(/current model is\s+(.+)$/i);
        if (m) return m[1].trim();
        const txt = (btn.textContent || '').trim();
        return txt || 'Model';
    }

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

        let subTries = 0;
        const ensureAndClick = () => {
            if (pickTarget()) { requestAnimationFrame(tryClick); return; }
            const legacyBtn = document.querySelector('[data-testid="Legacy models-submenu"]');
            if (legacyBtn) openLegacySubmenuOnce();
            if (subTries++ < 15) requestAnimationFrame(ensureAndClick);
            else requestAnimationFrame(tryClick); // 兜底
        };
        requestAnimationFrame(ensureAndClick);

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

        const openMenu = async () => {
            if (openedMenu) { closeMenu(); return; }
            const m = document.createElement('div');
            m.className = `${MINI_MODEL_CLASS}-menu`;
            const render = () => {
                m.innerHTML = '';
                MODEL_MAP.forEach(opt => {
                    const row = document.createElement('div');
                    row.className = `${MINI_MODEL_CLASS}-item`;
                    row.textContent = opt.label;
                    row.addEventListener('click', (e) => {
                        e.stopPropagation(); closeMenu(); clickNativeModel(opt.label);
                    });
                    m.appendChild(row);
                });
            };
            if (!MODEL_MAP.length) {
                // 首次或切换后尚未加载，先占位再拉取
                const row = document.createElement('div');
                row.className = `${MINI_MODEL_CLASS}-item`;
                row.textContent = 'Loading...';
                m.appendChild(row);
                const r0 = btn.getBoundingClientRect();
                placeMenu(m, r0);
                openedMenu = m;
                await __cgptReloadModelMap();
                render();
            } else {
                render();
            }
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
            const anchor = [pillEl, host.querySelector('.' + PILL_CLASS), plusBtn]
                .find(node => node && node.parentNode === host);
            if (anchor) {
                host.insertBefore(mini, anchor.nextSibling);
            } else {
                host.appendChild(mini);
            }
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

    function ensureHeaderModelObserved(){
        const btn = findHeaderModelButton();
        if (!btn || btn.__cgptMiniModelObserved) return;
        const mo = new MutationObserver(() => updateMiniModelText());
        mo.observe(btn, { attributes:true, childList:true, subtree:true });
        btn.__cgptMiniModelObserved = true;
    }
    ensureHeaderModelObserved();

// 当页面 DOM 变化时，若按钮被替换则重新绑定
    (function observeHeaderButtonMount(){
        const rebinder = new MutationObserver(() => ensureHeaderModelObserved());
        rebinder.observe(document.body, { childList:true, subtree:true });
        window.addEventListener('popstate', ensureHeaderModelObserved, { passive:true });
    })();

    // NEW: 监听“Show additional models”开关，切换时刷新 MODEL_MAP
    (function observeAdditionalModelsSwitch(){
        if (window.__cgptObsAdditionalModelsInstalled) return;
        window.__cgptObsAdditionalModelsInstalled = true;

        function hook(btn){
            if (!btn || btn.__cgptHooked) return;
            btn.__cgptHooked = true;

            let scheduled = false;
            let initialized = false;     // ← 新增：用于屏蔽初始化阶段的属性抖动
            // 等下一轮事件循环后再认为“已初始化”
            setTimeout(() => { initialized = true; }, 0);

            // 改为轻量刷新模型映射，而不是整页刷新
            const scheduleRefreshModels = () => {
                if (scheduled) return;
                scheduled = true;
                setTimeout(async () => {
                    try {
                        await __cgptReloadModelMap(); // 轻量更新 MODEL_MAP
                        // 若迷你模型菜单当前已打开，关闭以避免显示旧数据
                        document.querySelectorAll('.' + MINI_MODEL_CLASS + '-menu').forEach(n => n.remove());
                    } finally {
                        scheduled = false;
                    }
                }, 250);
            };

            // 仅观察状态属性变化；初始化阶段的变化直接忽略
            new MutationObserver(muts => {
                if (!initialized) return; // ← 新增：忽略初始渲染阶段的属性写入
                if (muts.some(m => m.attributeName === 'aria-checked')) {
                    scheduleRefreshModels();
                }
            }).observe(btn, { attributes:true, attributeFilter:['aria-checked'] });
        }

        const scan = () => {
            const sw = document.querySelector('button[role="switch"][aria-label="Show additional models"]');
            if (sw) hook(sw);
        };
        scan();
        new MutationObserver(scan).observe(document.body, { childList:true, subtree:true });
    })();



    // 【修改版】在插入胶囊后，顺带插入迷你“模型切换器”
    function updatePromptPill() {
        const label = readStoredPromptLabel();
        const shouldShow = optionsList.filter(opt => opt.label !== 'Normal').some(opt => opt.label === label);
        const plusButtons = Array.from(document.querySelectorAll('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]'));

        const applyBeginnerLook = (pill) => {
            if (!pill) return;
            try {
                const on = sessionStorage.getItem('cgptBeginnerMode') !== '0';
                if (on) {
                    pill.style.background = 'rgb(169,181,194)';
                    pill.style.color = '#111';
                } else {
                    // 恢复默认（按主题）
                    if (document.documentElement.classList.contains('light')) {
                        pill.style.background = '#fff';
                    } else {
                        pill.style.background = 'rgba(255,255,255,0.08)';
                    }
                    pill.style.color = 'inherit';
                }
            } catch {}
        };

        plusButtons.forEach(btn => {
            const host = btn && btn.parentElement;
            if (!host) return;
            const existed = host.querySelector('.' + PILL_CLASS);

            if (!shouldShow) { if (existed) existed.remove(); ensureMiniModelSwitcher(host, btn); return; }

            if (existed) {
                const current = existed.getAttribute('data-label') || '';
                if (current !== String(label || '')) {
                    const textNode = existed.querySelector('span') || existed.firstElementChild;
                    if (textNode && textNode.tagName === 'SPAN') textNode.textContent = label || '';
                    existed.setAttribute('data-label', String(label || ''));
                }
                applyBeginnerLook(existed);           // NEW
                ensureMiniModelSwitcher(host, btn);
                return;
            }

            const pill = buildPill(label);
            applyBeginnerLook(pill);
            if (btn && btn.parentNode === host) {
                host.insertBefore(pill, btn.nextSibling);
            } else {
                host.appendChild(pill);
            }
            // NEW: 插入胶囊后，紧跟插入迷你模型切换器
            ensureMiniModelSwitcher(host, btn, pill);
        });
    }

    // 观察下拉菜单出现，并注入「Prompt」入口
    const mo = new MutationObserver((mutations) => {
        const patchGroup = (g) => {
            if (!g) return;

            // ① 先确定所属菜单根节点
            const menuRoot =
                g.closest('[role="menu"][data-radix-menu-content]') || g.closest('[role="menu"]');
            if (!menuRoot) return;

            // ② 若当前菜单根节点已插入过，直接跳过（保证“每个菜单一个”）
            if (menuRoot.__cgptUseStylePatched || menuRoot.querySelector('.cgpt-use-style-item')) {
                return;
            }

            // ③ 仍保留“只处理输入框 + 菜单”的判断
            const firstItem = g.querySelector('div[role="menuitem"]') || menuRoot.querySelector('div[role="menuitem"]');
            if (!firstItem) return;

            let isFromPlus = false;
            {
                const triggerId = menuRoot.getAttribute('aria-labelledby');
                const triggerEl = triggerId ? document.getElementById(triggerId) : null;
                const matchPlus = sel => triggerEl && (triggerEl.matches?.(sel) || triggerEl.closest?.(sel));
                isFromPlus = !!matchPlus('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]');
                if (!isFromPlus && menuRoot.id) {
                    const plusBtn = document.querySelector('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]');
                    const controls = plusBtn?.getAttribute('aria-controls') || '';
                    if (controls.split(/\s+/).includes(menuRoot.id)) isFromPlus = true;
                }
            }
            if (!isFromPlus) return;

            // ④ 统一选择“菜单内的第一个 group”作为插入容器，避免多 group 多次插入
            const insertGroup = menuRoot.querySelector('div[role="group"]') || g;

            // ⑤ 构建条目并加唯一类名用于去重
            const mi = document.createElement('div');
            mi.setAttribute('role', 'menuitem');
            mi.setAttribute('tabindex', '0');
            mi.className = 'group __menu-item gap-1.5 cgpt-use-style-item';
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

                // --- NEW: Beginner Mode 切换 ---
                const bmRow = document.createElement('div');
                bmRow.style.cssText = 'padding:6px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between';
                const bmText = document.createElement('span');
                bmText.textContent = 'Beginner Mode';
                const bmMark = document.createElement('span');
                bmMark.textContent = '✓';
                try {
                    const on = sessionStorage.getItem('cgptBeginnerMode') !== '0';
                    bmMark.style.opacity = on ? '1' : '0';
                } catch { bmMark.style.opacity = '1'; }
                bmRow.append(bmText, bmMark);
                bmRow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    try {
                        const cur = sessionStorage.getItem('cgptBeginnerMode') !== '0';
                        sessionStorage.setItem('cgptBeginnerMode', cur ? '0' : '1');
                    } catch {}
                    // 即时更新胶囊外观
                    updatePromptPill();
                    pop.remove();
                });
                pop.appendChild(bmRow);

                document.body.appendChild(pop);
                setTimeout(() => {
                    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close, true); } };
                    document.addEventListener('click', close, true);
                }, 0);
            });

            const anchor = insertGroup.querySelector('div[role="menuitem"]');
            if (anchor && anchor.parentNode === insertGroup) insertGroup.insertBefore(mi, anchor);
            else insertGroup.appendChild(mi);

            // ⑥ 标记“该菜单已插入”，保证后续 group 不会再插
            menuRoot.__cgptUseStylePatched = true;
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
