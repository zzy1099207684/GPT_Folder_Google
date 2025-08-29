(function () {
    const Normal_text = '※horizontal lines (---, ——, —, ***) strictly prohibited※';
    const Concise = 'Concise';
    const Concise_text = '※Shorter responses & more messages;horizontal lines (---, ——, —, ***) strictly prohibited※';
    const Explanatory = 'Explanatory';
    const Explanatory_text = '※Explain thoroughly;horizontal lines (---, ——, —, ***) strictly prohibited※';

    // 若需要日后扩展，可在页面任意脚本设置
    function getOptions() {
        const ext = Array.isArray(window.__cgptPromptOptions) ? window.__cgptPromptOptions : [];
        const hasNormal = ext.some(o => String(o.label || '').toLowerCase() === 'normal');
        const hasBasic = ext.some(o => String(o.label || '').toLowerCase() === Concise);
        const hasExplanatory = ext.some(o => String(o.label || '').toLowerCase() === Explanatory);
        const base = [];
        if (!hasNormal) base.push({ label: 'Normal', text: Normal_text});   // 默认选项
        if (!hasBasic)  base.push({ label: Concise,  text: Concise_text});
        if (!hasExplanatory)  base.push({ label: Explanatory,  text: Explanatory_text});
        return base.concat(ext);
    }

    // 简易提示
    function toast(msg) {
        try {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:24px;transform:translateX(-50%);background:#333;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
        } catch {}
    }

    // 观察下拉菜单的出现
    const mo = new MutationObserver(() => {
        // 查找包含“Add photos & files”的菜单群组
        const groups = document.querySelectorAll('div[role="group"]');
        groups.forEach(g => {
            if (g.__cgptPromptMenuPatched) return;
            const item = g.querySelector('div[role="menuitem"]');
            if (!item) return;

            const hasAddFiles = Array.from(g.querySelectorAll('div[role="menuitem"]'))
                .some(n => /Add photos\s*&\s*files/i.test(n.textContent || ''));

            if (!hasAddFiles) return;

            // 插入我们的“Prompt”菜单项
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

            // 二级子菜单（简单弹层）
            mi.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const opts = getOptions();
                const pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;z-index:2147483647;min-width:160px;background:#2b2b2b;color:#e7d8c5;border-radius:8px;padding:6px 0;box-shadow:0 4px 10px rgba(0,0,0,2)';
                const rect = mi.getBoundingClientRect();
                pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 180)) + 'px';
                pop.style.top  = (rect.bottom + 6) + 'px';

                // 当前已选；严格以 sessionStorage 为准；未设置时为 null（不默认高亮 Normal）
                const storedPrompt = (() => {
                    try {
                        const raw = sessionStorage.getItem('cgptSessionPrompt');
                        return raw ? JSON.parse(raw) : null;
                    } catch { return null; }
                })();
                const currentLabel = (storedPrompt && typeof storedPrompt.label === 'string')
                    ? String(storedPrompt.label).trim()
                    : null;

                opts.forEach(o => {
                    const row = document.createElement('div');
                    row.textContent = String(o.label || '').trim() || 'Unnamed';
                    row.style.cssText = 'padding:6px 12px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:space-between';
                    // 选中态渲染：高亮 + √
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
                            const isSame = currentLabel && chosen === currentLabel; // 同项则取反为 off
                            if (isSame) {
                                sessionStorage.removeItem('cgptSessionPrompt');
                                toast('Start Prompt：off');
                            } else {
                                sessionStorage.setItem('cgptSessionPrompt', JSON.stringify({ label: o.label, text: o.text }));
                                toast('Start Prompt：' + (chosen || 'Unnamed'));
                            }
                        } catch {}
                        pop.remove();
                    });

                    pop.appendChild(row);
                });

                document.body.appendChild(pop);
                setTimeout(() => {
                    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close, true); } };
                    document.addEventListener('click', close, true);
                }, 0);
            });

            // 插入到现有组的第一个 menuitem 之前，或末尾
            const anchor = g.querySelector('div[role="menuitem"]');
            if (anchor && anchor.parentNode === g) {
                g.insertBefore(mi, anchor);
            } else {
                g.appendChild(mi);
            }

            g.__cgptPromptMenuPatched = true;
        });
    });

    mo.observe(document.body, { childList: true, subtree: true });

    // 页面卸载清理
    window.addEventListener('pagehide', () => { try { mo.disconnect(); } catch {} }, { passive: true });
})();
