(function () {
    const Normal_text = '※Balanced responses with natural flow; horizontal lines (---, ——, —, ***) are absolutely forbidden※';
    const Concise = 'Concise';
    const Concise_text = '※Shorter responses & more messages;horizontal lines (---, ——, —, ***) are absolutely forbidden※';
    const Explanatory = 'Explanatory';
    const Explanatory_text = '※Explain thoroughly;horizontal lines (---, ——, —, ***) are absolutely forbidden※';
    const Educational  = 'Educational';
    const Educational_text = '※Educational responses for learning;horizontal lines (---, ——, —, ***) are absolutely forbidden※';
    const Formal  = 'Formal';
    const Formal_text = '※Clear and well-structured responses;horizontal lines (---, ——, —, ***) are absolutely forbidden※';

    function getOptions() {
        const ext = Array.isArray(window.__cgptPromptOptions) ? window.__cgptPromptOptions : [];
        const hasNormal = ext.some(o => String(o.label || '').toLowerCase() === 'normal');
        const hasBasic = ext.some(o => String(o.label || '').toLowerCase() === Concise);
        const hasExplanatory = ext.some(o => String(o.label || '').toLowerCase() === Explanatory);
        const hasEducational = ext.some(o => String(o.label || '').toLowerCase() === Educational);
        const hasFormal = ext.some(o => String(o.label || '').toLowerCase() === Formal);
        const base = [];
        if (!hasNormal) base.push({ label: 'Normal', text: Normal_text});
        if (!hasBasic)  base.push({ label: Concise,  text: Concise_text});
        if (!hasExplanatory)  base.push({ label: Explanatory,  text: Explanatory_text});
        if (!hasEducational)  base.push({ label: Educational,  text: Educational_text});
        if (!hasFormal)  base.push({ label: Formal,  text: Formal_text});
        return base.concat(ext);
    }

    function toast(msg) {
        try {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:24px;transform:translateX(-50%);background:#333;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
        } catch {}
    }

    // 新增：读取/更新输入框处的 Prompt 胶囊
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
                sessionStorage.setItem('cgptSessionPrompt', JSON.stringify({ label: 'Normal', text: Normal_text }));
                toast('Start Prompt：off');
            } catch {}
            updatePromptPill();
        });

        pill.appendChild(icon);
        pill.appendChild(text);
        pill.appendChild(close);
        return pill;
    }

    // 把胶囊插入到 + 按钮右侧；Normal 或空则移除
    function updatePromptPill() {
        const label = readStoredPromptLabel();
        const shouldShow = label === Concise || label === Explanatory;

        // 找到所有输入框的 + 按钮（精确选择器来自页面结构）:contentReference[oaicite:2]{index=2}
        const plusButtons = Array.from(document.querySelectorAll('form[data-type="unified-composer"] [data-testid="composer-plus-btn"]'));
        plusButtons.forEach(btn => {
            const host = btn && btn.parentElement; // <span class="flex"> 包裹 + 按钮
            if (!host) return;

            // 清理旧的
            host.querySelectorAll('.' + PILL_CLASS).forEach(n => n.remove());

            if (shouldShow) {
                const pill = buildPill(label);
                // 插入到 + 号右侧
                host.insertBefore(pill, btn.nextSibling);
            }
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
            text.innerHTML = '<div class="truncate">Prompt</div>';

            mi.appendChild(icon);
            mi.appendChild(text);

            mi.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const opts = getOptions();
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

                opts.forEach(o => {
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
                                sessionStorage.removeItem('cgptSessionPrompt');
                                toast('Start Prompt：off');
                            } else {
                                sessionStorage.setItem('cgptSessionPrompt', JSON.stringify({ label: o.label, text: o.text }));
                                toast('Start Prompt：' + (chosen || 'Unnamed'));
                            }
                        } catch {}
                        pop.remove();
                        // 新增：菜单选择后刷新输入框处胶囊
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
                if (!needRefresh && node.querySelector?.('form[data-type="unified-composer"]')) needRefresh = true;
            });
        }
        if (needRefresh) requestAnimationFrame(updatePromptPill);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // 进入页面先渲染一次；跨 tab 变化也同步
    updatePromptPill();
    window.addEventListener('storage', (e) => {
        if (e.key === 'cgptSessionPrompt') updatePromptPill();
    }, { passive: true });

    window.addEventListener('pagehide', () => { try { mo.disconnect(); } catch {} }, { passive: true });
})();
