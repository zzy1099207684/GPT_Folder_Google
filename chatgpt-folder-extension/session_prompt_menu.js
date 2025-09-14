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
                // 需要隐藏：仅当存在时移除，避免无谓操作
                if (existed) existed.remove();
                return;
            }

            // 需要显示
            if (existed) {
                // 标签相同则不动；不同只更新文本与 data-label，避免“删后再插”的闪烁
                const current = existed.getAttribute('data-label') || '';
                if (current === String(label || '')) return;

                const textNode = existed.querySelector('span:nth-of-type(2)');
                if (textNode) textNode.textContent = label || '';
                existed.setAttribute('data-label', String(label || ''));
                return;
            }

            // 首次存在：创建并插入到 + 按钮右侧
            const pill = buildPill(label);
            host.insertBefore(pill, btn.nextSibling);
        });
    }


    // 观察下拉菜单出现，并注入「Prompt」入口
    const mo = new MutationObserver((mutations) => {
        const patchGroup = (g) => {
            if (!g || g.__cgptPromptMenuPatched) return;

            const firstItem = g.querySelector('div[role="menuitem"]');
            if (!firstItem) return;

            const hasAddFiles = Array
                .from(g.querySelectorAll('div[role="menuitem"]'))
                .some(n => /Add photos\s*&\s*files/i.test(n.textContent || ''));

            if (!hasAddFiles) return;

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
