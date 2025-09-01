// prompt_toggle.js
(() => {
    if (window.__cgptPromptToggleModule) return;
    window.__cgptPromptToggleModule = true;

    // 独立存取映射，默认开启（未定义视为 true）
    window.__cgptPromptTogglePerPath = window.__cgptPromptTogglePerPath || (() => {
        try { return JSON.parse(sessionStorage.getItem('cgptPromptToggle') || '{}'); }
        catch { return {}; }
    })();

    // 轻量选择器与防抖，避免依赖 content.js 内部工具
    const qs = (sel, root = document) => {
        try {
            const base = root && typeof root.querySelector === 'function' ? root : document;
            return base.querySelector(sel);
        } catch { return null; }
    };
    const debounce = (fn, wait = 200) => {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
    };

    // 导出同名函数，供原有调用点直接使用
    window.ensurePromptToggle = function ensurePromptToggle() {
        const form = qs('form[data-type="unified-composer"]');
        if (!form) return;

        // 固定输入框样式（按原逻辑）
        try {
            const STYLE_ID = 'cgpt-fixed-composer-style';
            if (!document.getElementById(STYLE_ID)) {
                const s = document.createElement('style');
                s.id = STYLE_ID;
                s.textContent = `
          form[data-type="unified-composer"] .__zzy-fixed-composer{
            background:#2b2b2b !important;
            border-radius:28px !important;
            box-shadow:0 2px 6px rgba(0,0,0,0.15);
            display:grid !important;
            grid-template-columns:auto 1fr auto !important;
            grid-template-areas:
              "header header header"
              "primary primary primary"
              "leading footer trailing" !important;
            overflow:clip !important;
            padding:10px !important;
          }
          form[data-type="unified-composer"] .__zzy-fixed-composer [grid-area="primary"],
          form[data-type="unified-composer"] .__zzy-fixed-composer [style*="grid-area: primary"]{
            min-height:56px;
            margin-top:0 !important;
          }
        `;
                document.head.appendChild(s);
            }
            const paintComposer = () => {
                const box = form.querySelector('.bg-token-bg-primary') ||
                    form.querySelector('[style*="grid-template-areas"]');
                if (box && !box.classList.contains('__zzy-fixed-composer')) {
                    box.classList.add('__zzy-fixed-composer');
                }
            };
            paintComposer();

            if (!form.__fixedComposerRO) {
                const ro = new ResizeObserver(paintComposer);
                ro.observe(form);
                form.__fixedComposerRO = ro;
            }
            if (!form.__fixedComposerMO) {
                const mo = new MutationObserver(debounce(paintComposer, 50));
                mo.observe(form, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
                form.__fixedComposerMO = mo;
            }
        } catch {}

        const path = location.pathname || '/';
        const key = (path === '/' && window.__cgptPendingToken) ? `/${window.__cgptPendingToken}` : path;

        let box = form.querySelector('#cgpt-prompt-toggle');

        // 位置计算：优先靠近麦克风，其次发送按钮，否则右下角兜底
        const placeBox = (b) => {
            try {
                const micBtn = qs(
                    'button[aria-label*="voice" i],button[aria-label*="microphone" i],button[aria-label*="语音"],button[aria-label*="麦克风"],button[data-testid*="voice" i]',
                    form
                );
                const target = micBtn || qs('#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send"]', form);
                const fr = form.getBoundingClientRect();
                if (target) {
                    const tr = target.getBoundingClientRect();
                    const left = Math.max(8, Math.round(tr.left - fr.left - b.offsetWidth - 40));
                    const top  = Math.round(tr.top - fr.top + (tr.height - b.offsetHeight) / 2);
                    b.style.left = left + 'px';
                    b.style.top  = top  + 'px';
                    b.style.right = 'auto';
                    b.style.bottom = 'auto';
                } else {
                    b.style.left = '';
                    b.style.right = '92px';
                    b.style.top = 'auto';
                    b.style.bottom = '8px';
                }
            } catch {}
        };

        if (!box) {
            box = document.createElement('div');
            box.id = 'cgpt-prompt-toggle';
            box.style.cssText = [
                'position:absolute','z-index:3','display:flex','align-items:center','gap:6px',
                'background:rgba(255,255,255,0.05)','border-radius:12px','padding:2px 8px',
                'font-size:12px','user-select:none'
            ].join(';');

            const label = document.createElement('span');
            label.textContent = 'prompt';

            const sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'cgpt-switch';
            sw.style.cssText = [
                'width:34px','height:20px','border-radius:10px','border:none',
                'position:relative','cursor:pointer','outline:none'
            ].join(';');

            const knob = document.createElement('span');
            knob.style.cssText = [
                'position:absolute','top:2px','left:2px','width:16px','height:16px',
                'border-radius:50%','background:#fff','transition:left .15s'
            ].join(';');
            sw.appendChild(knob);

            const render = (on) => {
                sw.setAttribute('aria-pressed', String(!!on));
                sw.style.background = on ? '#10a37f' : '#666';
                knob.style.left = on ? '16px' : '2px';
            };

            const map = window.__cgptPromptTogglePerPath || {};
            render(map[key] !== false);

            sw.onclick = () => {
                const pathNow = location.pathname;
                const keyNow = (pathNow === '/' && window.__cgptPendingToken) ? `/${window.__cgptPendingToken}` : pathNow;
                const next = !(window.__cgptPromptTogglePerPath[keyNow] !== false);
                window.__cgptPromptTogglePerPath[keyNow] = next;
                try { sessionStorage.setItem('cgptPromptToggle', JSON.stringify(window.__cgptPromptTogglePerPath)); } catch {}
                render(next);
            };

            box.append(label, sw);
            form.appendChild(box);

            // 保障定位上下文
            try { if (getComputedStyle(form).position === 'static') form.style.position = 'relative'; } catch {}

            placeBox(box);

            if (!form.__promptToggleRO) {
                const ro = new ResizeObserver(() => placeBox(box));
                ro.observe(form);
                form.__promptToggleRO = ro;
            }

            const mic = qs(
                'button[aria-label*="voice" i],button[aria-label*="microphone" i],button[aria-label*="语音"],button[aria-label*="麦克风"],button[data-testid*="voice" i]',
                form
            );
            if (mic && !form.__promptToggleMicRO) {
                try {
                    const ro2 = new ResizeObserver(() => placeBox(box));
                    ro2.observe(mic);
                    form.__promptToggleMicRO = ro2;
                } catch {}
            }

            // 编辑器输入变化时也重新定位
            const ed = qs('.ProseMirror', form) || qs('#prompt-textarea', form) || form.querySelector('[contenteditable="true"]');
            if (ed && !form.__promptToggleInputHooked) {
                const update = () => placeBox(box);
                ed.addEventListener('input', update);
                ed.addEventListener('paste', () => setTimeout(update, 0));
                ed.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') requestAnimationFrame(update);
                }, true);
                form.__promptToggleInputHooked = true;
            }

            // trailing 区域结构变化也要跟随
            if (!form.__promptToggleMO) {
                try {
                    const mo = new MutationObserver(debounce(() => placeBox(box), 16));
                    const trailing =
                        qs('[grid-area="trailing"]', form) ||
                        qs('[style*="grid-area: trailing"]', form) ||
                        qs('[style*="grid-area:trailing"]', form) ||
                        form;
                    mo.observe(trailing, {attributes:true, subtree:true, attributeFilter:['class','style','data-state','aria-hidden']});
                    form.__promptToggleMO = mo;
                } catch {}
            }

            window.addEventListener('resize', () => placeBox(box), {passive:true});
        } else {
            // 已存在时同步当前 key 的状态并重算位置
            const keyNow = (path === '/' && window.__cgptPendingToken) ? `/${window.__cgptPendingToken}` : path;
            const on = (window.__cgptPromptTogglePerPath || {})[keyNow] !== false;
            const sw = box.querySelector('.cgpt-switch');
            const knob = sw?.firstElementChild;
            if (sw && knob) {
                sw.setAttribute('aria-pressed', String(!!on));
                sw.style.background = on ? '#10a37f' : '#666';
                knob.style.left = on ? '16px' : '2px';
            }
            placeBox(box);
        }
    };
})();
