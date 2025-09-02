const INSTALLED = 'data-cgpt-bookmarks-installed';

if (document.documentElement.hasAttribute(INSTALLED)) {
    // 若已重复，清理多余 wrapper（可选）
    document.querySelectorAll('#cgpt-bookmarks-wrapper').forEach((n, i) => {
        if (i) n.remove();
    });
    console.warn('[Bookmark] duplicate world detected. skip.');
} else {
    document.documentElement.setAttribute(INSTALLED, '1');

    const HIST_ANCHOR = 'div#history a[href*="/c/"], nav[aria-label="Chat history"] a[href*="/c/"]';
    const MAX_PROMPTS = 4;
    (() => { // 立即执行函数隔离作用域
        function nanoid(size = 21) {
            let id = ''
            const chars = 'ModuleSymbhasOwnPr-0123456789ABCDEFGHIJKLNQRTUVWXYZ_cfgijkpqtvxz'
            let i = size
            while (i--) id += chars[Math.random() * 64 | 0]
            return id
        }

        function safeSendMessage(msg) {
            try {
                if (chrome?.runtime?.id && typeof chrome.runtime.sendMessage === 'function') {
                    chrome.runtime.sendMessage(msg, () => {
                        void chrome.runtime.lastError;
                    });
                }
            } catch (_) {
            }
        }

        function ensurePromptToggle() {
            const form = qs('form[data-type="unified-composer"]');
            if (!form) return;

            // ===== 新增：把输入框固定为图一样式（默认保持展开态外观） =====
            try {
                const STYLE_ID = 'cgpt-fixed-composer-style';
                if (!document.getElementById(STYLE_ID)) {
                    const s = document.createElement('style');
                    s.id = STYLE_ID;
                    s.textContent = `
                    form[data-type="unified-composer"] .__zzy-fixed-composer{
                      background:#2b2b2b !important;            
                      border-radius:28px !important;            
                      box-shadow:var(--shadow-short,0 4px 12px rgba(0,0,0,.25)) !important;
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
                // 选中输入框外层容器：优先按你页面中的 bg-token-bg-primary
                const composerBox =
                    form.querySelector('.bg-token-bg-primary') ||   // 典型外层容器类
                    form.querySelector('[style*="grid-template-areas"]'); // 兜底
                if (composerBox && !composerBox.classList.contains('__zzy-fixed-composer')) {
                    composerBox.classList.add('__zzy-fixed-composer');
                }
                // 监听 DOM 变化，若组件重渲染则自动补涂一次
                if (!form.__zzyFixedComposerMO) {
                    const mo = new MutationObserver(() => {
                        const boxNow =
                            form.querySelector('.bg-token-bg-primary') ||
                            form.querySelector('[style*="grid-template-areas"]');
                        if (boxNow && !boxNow.classList.contains('__zzy-fixed-composer')) {
                            boxNow.classList.add('__zzy-fixed-composer');
                        }
                    });
                    mo.observe(form, {childList: true, subtree: true});
                    form.__zzyFixedComposerMO = mo;
                }
            } catch {
            }
            // ===== 新增结束 =====

            // 非组内会话也显示开关
            const path = location.pathname;
            let box = form.querySelector('#cgpt-prompt-toggle');
            // 去掉隐藏早退分支，始终渲染

            // 去掉隐藏早退分支，始终渲染


            // 计算与发送前计数器一致的 key（根路径首条消息用临时 token 键）
            const key = (path === '/' && window.__cgptPendingToken)
                ? `/${window.__cgptPendingToken}` : path;

            function placeBox(b) {
                try {
                    // 尽量匹配多语言与不同实现
                    const micBtn = qs(
                        [
                            'button[aria-label*="voice" i]',
                            'button[aria-label*="microphone" i]',
                            'button[aria-label*="语音"]',
                            'button[aria-label*="麦克风"]',
                            'button[data-testid*="voice" i]'
                        ].join(','),
                        form
                    );
                    // 找不到麦克风则回退到发送按钮，避免位置丢失
                    const target = micBtn || qs('#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send"]', form);
                    const fr = form.getBoundingClientRect();
                    if (target) {
                        const tr = target.getBoundingClientRect();
                        const left = Math.max(8, Math.round(tr.left - fr.left - b.offsetWidth - 40)); // 与目标间距 8px
                        const top = Math.round(tr.top - fr.top + (tr.height - b.offsetHeight) / 2); // 垂直居中
                        b.style.left = left + 'px';
                        b.style.top = top + 'px';
                        b.style.right = 'auto';
                        b.style.bottom = 'auto';
                    } else {
                        // 兜底：仍保持原来的靠右策略
                        b.style.left = '';
                        b.style.right = '92px';
                        b.style.top = 'auto';
                        b.style.bottom = '8px';
                    }
                } catch {
                }
            }

            let __rafId = 0;
            const placeBoxRaf = (b) => {
                if (__rafId) return;
                __rafId = requestAnimationFrame(() => {
                    __rafId = 0;
                    placeBox(b);
                });
            };

            if (!box) {
                box = document.createElement('div');
                box.id = 'cgpt-prompt-toggle';
                box.style.cssText = [
                    'position:absolute', 'z-index:3',
                    'display:flex', 'align-items:center', 'gap:6px',
                    'background:rgba(255,255,255,0.05)', 'border-radius:12px',
                    'padding:2px 8px', 'font-size:12px', 'user-select:none'
                ].join(';');

                const label = document.createElement('span');
                label.textContent = 'prompt';

                const sw = document.createElement('button');
                sw.type = 'button';
                sw.className = 'cgpt-switch';
                sw.style.cssText = [
                    'width:34px', 'height:20px', 'border-radius:10px', 'border:none',
                    'position:relative', 'cursor:pointer', 'outline:none'
                ].join(';');

                const knob = document.createElement('span');
                knob.style.cssText = [
                    'position:absolute', 'top:2px', 'left:2px', 'width:16px', 'height:16px',
                    'border-radius:50%', 'background:#fff', 'transition:left .15s'
                ].join(';');
                sw.appendChild(knob);

                // 状态渲染
                const render = (on) => {
                    sw.setAttribute('aria-pressed', String(!!on));
                    sw.style.background = on ? '#10a37f' : '#666';
                    knob.style.left = on ? '16px' : '2px';
                };

                // 默认开启：未定义即 true
                const map = window.__cgptPromptTogglePerPath || {};
                const currentOn = map[key] !== false;
                render(currentOn);

                sw.onclick = () => {
                    const pathNow = location.pathname;
                    const keyNow = (pathNow === '/' && window.__cgptPendingToken)
                        ? `/${window.__cgptPendingToken}`
                        : pathNow;
                    const next = !(window.__cgptPromptTogglePerPath[keyNow] !== false);
                    window.__cgptPromptTogglePerPath[keyNow] = next;
                    try {
                        sessionStorage.setItem('cgptPromptToggle', JSON.stringify(window.__cgptPromptTogglePerPath));
                    } catch {
                    }
                    render(next);
                };


                box.append(label, sw);
                // 将容器加到表单。表单通常是相对定位；若不是，也不会影响交互
                form.appendChild(box);

                try {
                    const cs = getComputedStyle(form);
                    if (cs.position === 'static') form.style.position = 'relative';
                } catch {
                }

                placeBoxRaf(box);
                if (!form.__promptToggleRO) {
                    const ro = new ResizeObserver(() => placeBox(box));
                    ro.observe(form);
                    form.__promptToggleRO = ro;
                }
                const __mic = qs(
                    'button[aria-label*="voice" i],button[aria-label*="microphone" i],button[aria-label*="语音"],button[aria-label*="麦克风"],button[data-testid*="voice" i]',
                    form
                );
                if (__mic && !form.__promptToggleMicRO) {
                    try {
                        const ro2 = new ResizeObserver(() => placeBox(box));
                        ro2.observe(__mic);
                        form.__promptToggleMicRO = ro2;
                    } catch {
                    }
                }

                const ed =
                    qs('.ProseMirror', form) ||
                    qs('#prompt-textarea', form) ||
                    form.querySelector('[contenteditable="true"]');
                if (ed && !form.__promptToggleInputHooked) {
                    const update = () => placeBoxRaf(box);
                    ed.addEventListener('input', update);
                    ed.addEventListener('paste', () => setTimeout(update, 0));
                    ed.addEventListener(
                        'keydown',
                        e => {
                            if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                                requestAnimationFrame(update);
                            }
                        },
                        true
                    );
                    form.__promptToggleInputHooked = true;
                }

                if (!form.__promptToggleMO) {
                    try {
                        // debounce 已在脚本前部定义
                        const mo = new MutationObserver(debounce(() => placeBox(box), 16));
                        // 优先监听 trailing 区域，取不到则退回 form
                        const trailing =
                            qs('[grid-area="trailing"]', form) ||                 // 若存在自定义属性
                            qs('[style*="grid-area: trailing"]', form) ||         // 样式包含 grid-area: trailing
                            qs('[style*="grid-area:trailing"]', form) ||          // 去掉空格的兼容
                            form;
                        mo.observe(trailing, {
                            attributes: true,
                            subtree: true,
                            attributeFilter: ['class', 'style', 'data-state', 'aria-hidden']
                        });
                        form.__promptToggleMO = mo;
                    } catch {
                    }
                }

                window.addEventListener('resize', () => placeBox(box), {passive: true});
            } else {
                // 已存在时同步当前 key 的状态
                const keyNow = (path === '/' && window.__cgptPendingToken)
                    ? `/${window.__cgptPendingToken}` : path;
                const map = window.__cgptPromptTogglePerPath || {};
                const on = map[keyNow] !== false;
                const sw = box.querySelector('.cgpt-switch');
                const knob = sw?.firstElementChild;
                if (sw && knob) {
                    sw.setAttribute('aria-pressed', String(!!on));
                    sw.style.background = on ? '#10a37f' : '#666';
                    knob.style.left = on ? '16px' : '2px';
                }
                placeBoxRaf(box);
            }
        }


        window.__cgptPromptTogglePerPath = (() => {
            try {
                return JSON.parse(sessionStorage.getItem('cgptPromptToggle') || '{}');
            } catch {
                return {};
            }
        })();


        // 单实例哨兵：若已存在则直接退出，防止重复执行
        if (window.__cgptBookmarksInstance) {
            console.warn('[Bookmark] Duplicate instance detected, aborting.');
            return;
        }
        window.__cgptBookmarksInstance = true;

        const liveSyncMap = new Map();

        /* ===== debounced save ===== */
        let _saveFoldersTimer = null;

        function scheduleSaveFolders(delay = 600) {
            clearTimeout(_saveFoldersTimer);
            _saveFoldersTimer = setTimeout(async () => {
                try {
                    if (chrome?.runtime?.id) {
                        // 同步写入 storage.sync，保证 collapsed 状态持久化
                        await storage.set({folders});
                        safeSendMessage({type: 'save-folders', data: folders});
                    }
                } catch (e) {
                    console.warn('[Bookmark] Debounced save error:', e);
                }
            }, delay);
        }


        // 在observers对象中添加新方法
        const observers = {
            list: [],
            add(observer) {
                this.list.push(observer);
                return observer;
            },
            disconnectAll() {
                this.list.forEach(obs => {
                    try {
                        obs.disconnect();
                    } catch (e) {
                        console.warn('[Bookmark] Error disconnecting observer:', e);
                    }
                });
                this.list = [];
            },
            cleanup() {
                // 移除页面中不存在的观察者
                const initialLength = this.list.length;
                this.list = this.list.filter(obs => {
                    try {
                        return obs && typeof obs.disconnect === 'function';
                    } catch (e) {
                        return false;
                    }
                });
                if (initialLength !== this.list.length) {
                    console.log(`[Bookmark] Cleaned up ${initialLength - this.list.length} broken observers`);
                }
            }
        };
        window.observers = observers;

        function enqueueIdleTask(fn, timeout = 1000) {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(fn, {timeout});
            } else {
                setTimeout(fn, 0);
            }
        }

        window.enqueueIdleTask = enqueueIdleTask;

        /* === NEW: Chats 折叠角标 === */
        ;(() => {
            const STORAGE_KEY = 'cgptChatsCollapsed';

            // 侧栏根：与现有代码保持一致的容错选择器
            const pickSidebarRoot = () =>
                document.querySelector('nav[aria-label="Chat history"]') ||
                document.querySelector('#stage-slideover-sidebar nav[aria-label="Chat history"]') ||
                document.querySelector('#history') ||
                document.body;

            // 样式：折叠时隐藏 Chats 下的会话项（仅 /c/）
            const ensureStyle = () => {
                if (document.getElementById('cgpt-chats-collapse-style')) return;
                const st = document.createElement('style');
                st.id = 'cgpt-chats-collapse-style';
                st.textContent = `
                  nav[aria-label="Chat history"].__cgpt-chats-collapsed a.__menu-item[href*="/c/"],
                  #history.__cgpt-chats-collapsed a.__menu-item[href*="/c/"] { display:none !important; }
                  /* 角标布局 */
                  #history h2.__menu-label, nav[aria-label="Chat history"] h2.__menu-label {
                      position:relative;
                    }
                    .__cgpt-chats-toggle {
                      position:absolute; right:12px; top:50%; transform:translateY(-50%);
                      cursor:pointer; user-select:none; font-weight:700; opacity:.9;
                    }
                `;
                document.head.appendChild(st);
            };

            const loadCollapsed = () => {
                try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
            };
            const saveCollapsed = v => { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {} };

            const findChatsHeader = root => {
                // light.txt 确认：Chats 位于 #history 内部的 h2.__menu-label，或直接在 nav 内部。:contentReference[oaicite:5]{index=5}
                const cands = root.querySelectorAll('h2.__menu-label');
                for (const h of cands) {
                    const t = (h.textContent || '').trim();
                    if (t === 'Chats') return h;
                }
                return null;
            };

            const patchOnce = () => {
                ensureStyle();
                const root = pickSidebarRoot();
                if (!root) return;

                // 根节点标记折叠类
                const collapsed = loadCollapsed();
                root.classList.toggle('__cgpt-chats-collapsed', collapsed);

                const header = findChatsHeader(root);
                if (!header || header.__cgptCollapserPatched) return;

                const btn = document.createElement('span');
                btn.className = '__cgpt-chats-toggle';
                btn.setAttribute('aria-label', 'Toggle chats');
                btn.textContent = collapsed ? '<' : 'v';
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cur = root.classList.toggle('__cgpt-chats-collapsed');
                    btn.textContent = cur ? '<' : 'v';
                    saveCollapsed(cur);
                });

                header.appendChild(btn);
                header.__cgptCollapserPatched = true;
            };

            // 初次与后续 DOM 变化保持
            const init = () => {
                if (window.__cgptChatsCollapser) return;
                window.__cgptChatsCollapser = true;

                patchOnce();

                const mo = new MutationObserver(() => patchOnce());
                mo.observe(document.body, { childList: true, subtree: true });
                // 若你的全局 observers 存在，则纳入统一管理
                try { window.observers?.add?.(mo); } catch {}
                window.addEventListener('beforeunload', () => { try { mo.disconnect(); } catch {} }, { passive: true });
            };

            // 延后到空闲帧，避开水合窗口
            (window.requestIdleCallback || (fn => setTimeout(fn, 120)))(init);
        })();
        /* === NEW END === */

        function debounce(fn, wait = 200) {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), wait);
            };
        }

        let CHUNK_BUDGET_MS = 4;                     // 默认单帧预算

        /* ===== 通用工具 ===== */
        const CLS = {tip: 'cgpt-tip'};
        const COLOR = {bgLight: 'rgba(255,255,255,.05)', bgHover: 'rgba(255,255,255,.1)'};

        /* ---------- pointerEvents 失效修复 ---------- */
        function isBlockingOverlayExist() {
            // 任意仍在屏幕上的全屏遮罩都会令函数返回 true
            return !!document.querySelector(
                '[data-state="open"][role="dialog"],' +           // Radix 弹窗 / 侧边栏
                '.fixed.inset-0[data-aria-hidden="true"],' +      // ChatGPT 本身的全屏层
                '.immersive-translate-modal[style*="display: flex"]'
            );
        }

        function restorePointerEvents() {
            const b = document.body;
            if (b && b.style.pointerEvents === 'none' && !isBlockingOverlayExist()) {
                b.style.pointerEvents = '';
            }
        }

        // 页面初始化后立即尝试一次
        requestAnimationFrame(restorePointerEvents);

        // 复制/粘贴/右键 在捕获阶段放行，避免被其它脚本拦截导致输入框内无法使用
        const __cgptAllowClipboard = (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            const isEditable =
                t.matches('input,textarea,[contenteditable="true"]') ||
                t.closest('[role="dialog"] input,[role="dialog"] textarea,[role="dialog"] [contenteditable="true"]');
            if (isEditable) {
                // 不改变默认行为，只阻止继续冒泡到可能会拦截的监听
                e.stopPropagation();
            }
        };
        window.addEventListener('copy', __cgptAllowClipboard, true);
        window.addEventListener('cut', __cgptAllowClipboard, true);
        window.addEventListener('paste', __cgptAllowClipboard, true);
        window.addEventListener('contextmenu', __cgptAllowClipboard, true);
        // === NEW: Edit message 发送前将首段 ※…※ 同步为当前选中 Prompt ===
        (function syncEditPromptOnSend() {
            function readCurrentPromptText() {
                try {
                    const raw = sessionStorage.getItem('cgptSessionPrompt');
                    const obj = raw ? JSON.parse(raw) : null;
                    const t = obj && typeof obj.text === 'string' ? obj.text.trim() : null;
                    return t && t.length ? t : null;
                } catch {
                    return null;
                }
            }

            function isLikelySend(btn) {
                if (!btn) return false;
                if (btn.id === 'composer-submit-button') return false; // 排除主输入框发送
                const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
                // 覆盖常见按钮文案
                return /(send|提交|保存|确定)/.test(label);
            }

            function findEditContainer(start) {
                let n = start, hop = 0;
                while (n && hop < 10) {
                    if (n.querySelector && n.querySelector('textarea,[contenteditable="true"]')) return n;
                    n = n.parentElement;
                    hop++;
                }
                return null;
            }

            function readPromptOptions() {
                try {
                    if (Array.isArray(window.__cgptPromptOptions)) return window.__cgptPromptOptions;
                    const raw = sessionStorage.getItem('cgptPromptOptions');
                    const arr = raw ? JSON.parse(raw) : null;
                    return Array.isArray(arr) ? arr : [];
                } catch {
                    return [];
                }
            }

            // 新增：去掉首尾 ※ 的对比辅助
            const stripMarkers = (s) => String(s || '').replace(/^※/, '').replace(/※$/, '');
            document.addEventListener('click', function (ev) {
                const btn = ev.target && ev.target.closest('button,[role="button"]');
                if (!isLikelySend(btn)) return;

                const box = findEditContainer(btn);
                if (!box) return;

                const editor = box.querySelector('textarea,[contenteditable="true"]');
                if (!editor || editor.id === 'prompt-textarea') return;

                const selected = readCurrentPromptText();
                if (!selected) return;

                const getText = (el) => el.tagName === 'TEXTAREA' ? el.value : (el.innerText || '');
                const setText = (el, val) => {
                    if (el.tagName === 'TEXTAREA') el.value = val;
                    else el.innerText = val;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                };

                const text = getText(editor);
                // 按区块扫描：※…※
                const BLOCK_RE = /※([\s\S]*?)※/g;
                const opts = readPromptOptions();
                const optionInners = opts.map(o => stripMarkers(o.text));
                const selectedInner = stripMarkers(selected);

                let m, replaced = false, out = '', last = 0;
                while ((m = BLOCK_RE.exec(text))) {
                    const blockStart = m.index;
                    const blockEnd = BLOCK_RE.lastIndex;
                    const inner = m[1];

                    // 优先：区块以某个菜单片段为前缀
                    let hit = optionInners.find(opt => inner.startsWith(opt));
                    if (hit) {
                        const innerNext = selectedInner + inner.slice(hit.length);
                        out += text.slice(last, blockStart) + '※' + innerNext + '※';
                        last = blockEnd;
                        replaced = true;
                        break; // 仅处理首个命中区块
                    }
                    // 次优：区块中包含某个菜单片段，则仅替换该子串
                    hit = optionInners.find(opt => inner.includes(opt));
                    if (hit) {
                        const innerNext = inner.replace(hit, selectedInner);
                        out += text.slice(last, blockStart) + '※' + innerNext + '※';
                        last = blockEnd;
                        replaced = true;
                        break;
                    }
                }
                if (replaced) {
                    const nextText = out + text.slice(last);
                    if (nextText !== text) setText(editor, nextText);
                }
            }, true);
        })();
        // === NEW END ===

        window.addEventListener('pagehide', () => {
            try {
                observers.disconnectAll();
            } catch {
            }
            try {
                window.__deepCleanerId && clearInterval(window.__deepCleanerId);
            } catch {
            }
        }, {passive: true});


        // 关键场景下再检查一次，确保后续状态同步
        window.addEventListener('resize', restorePointerEvents, {passive: true});
        const tryRestoreLater = () => setTimeout(restorePointerEvents, 50);
        document.addEventListener('pointerup', tryRestoreLater, true);
        document.addEventListener('dragend', tryRestoreLater, true);
        new MutationObserver(restorePointerEvents)
            .observe(document.body, {attributes: true, attributeFilter: ['style']});
        /* ---------- 修复段结束 ---------- */

        // 抽取 pathname，尽量避免 new URL
        function _path(u) {
            if (!u) return '';
            if (typeof u === 'string') {
                if (u.startsWith('/')) return u.split('?')[0];         // 绝对内部路径
                try {
                    return new URL(u, location.origin).pathname;
                } catch {
                    return '';
                }
            }
            // Anchor 元素或带 pathname 属性的对象
            if (u.pathname) return u.pathname.split('?')[0];
            try {
                return new URL(String(u), location.origin).pathname;
            } catch {
                return '';
            }
        }

        const samePath = (a, b) => _path(a) === _path(b);

        // 增强的选择器函数（健壮化）
        const qs = (sel, root = document) => {
            try {
                const base = root && typeof root.querySelector === 'function' ? root : document;
                return base.querySelector(sel);
            } catch (e) {
                console.warn(`[Bookmark] Error querying selector "${sel}":`, e);
                return null;
            }
        };

        const qsa = (sel, root = document) => {
            try {
                const base = root && typeof root.querySelectorAll === 'function' ? root : document;
                return Array.from(base.querySelectorAll(sel));
            } catch (e) {
                console.warn(`[Bookmark] Error querying all selector "${sel}":`, e);
                return [];
            }
        };

        // ① preset prompt and group
        const hints = [
            {
                label: 'change_code',
                text: ['※Only modify code directly related to the specific problem or requirement raised. After modification, perform self-testing to ensure that it fully meets the requirements, fully consider future expansion, and ensure stability and performance. Provide the original source code and modified version for easy comparison and manual implementation. If you need to add new code, please provide a small amount of original code around the new code location to facilitate positioning※']
            }
        ];         // 自行增删
        // 修改后的存储逻辑
        // Enhanced storage implementation with better error handling - replace storage object
        const storage = {
            _pendingWrites: {},
            _writeTimer: null,
            _writeDelay: 1000,
            _lastWriteTime: 0,
            _minInterval: 3000, // 最小写入间隔
            _retryCount: 0,
            _maxRetries: 3,
            _isRecovering: false,
            _maxPendingSize: 50, // 最大未处理条目数量

            /* ==== 修改后片段：storage.get ==== */
            async get(key) {
                try {
                    if (!chrome?.runtime?.id) return null;

                    // 新增：分片重组逻辑
                    // 兼容新老格式：优先按 meta.parts 聚合，否则退回 f_<id> 单块或 legacy
                    if (key === 'folders') {
                        const {folderKeys = []} = await chrome.storage.sync.get('folderKeys');
                        if (!folderKeys.length) {
                            const legacy = await chrome.storage.sync.get('folders');
                            return legacy.folders || {};
                        }

                        const metaKeys = folderKeys.map(id => `f_${id}__meta`);
                        const metas = await chrome.storage.sync.get(metaKeys);

                        // 预组装全部分片键
                        const allPartKeys = [];
                        folderKeys.forEach(id => {
                            const meta = metas[`f_${id}__meta`];
                            if (meta && Number.isInteger(meta.parts) && meta.parts > 0) {
                                for (let i = 0; i < meta.parts; i++) allPartKeys.push(`f_${id}__p${i}`);
                            }
                        });

                        // 一次性并发取回：分片、gap 映射、以及所有可能的单块键
                        const [partsObj, gapObj, singlesObj] = await Promise.all([
                            allPartKeys.length ? chrome.storage.sync.get(allPartKeys) : Promise.resolve({}),
                            chrome.storage.sync.get('folderGaps'),
                            chrome.storage.sync.get(folderKeys.map(id => 'f_' + id))
                        ]);
                        const gapMap = (gapObj && gapObj.folderGaps) || {};

                        const folders = {};
                        for (const id of folderKeys) {
                            const meta = metas[`f_${id}__meta`];
                            if (meta && Number.isInteger(meta.parts)) {
                                let chats = [];
                                for (let i = 0; i < (meta.parts || 0); i++) {
                                    const part = partsObj[`f_${id}__p${i}`];
                                    if (part && Array.isArray(part.chats)) chats = chats.concat(part.chats);
                                }
                                folders[id] = {
                                    name: meta.name || 'Group',
                                    collapsed: !!meta.collapsed,
                                    prompts: Array.isArray(meta.prompts) ? meta.prompts : [],
                                    gap: Number.isFinite(gapMap[id]) ? gapMap[id]
                                        : (Number.isFinite(meta.gap) ? meta.gap : 0),
                                    chats
                                };
                            } else {
                                folders[id] = singlesObj['f_' + id] || {};
                            }
                        }
                        return folders;
                    }


                    const obj = await chrome.storage.sync.get(key);
                    return obj[key];
                } catch (e) {
                    console.warn('[Bookmark] storage.get error', e);
                    return null;
                }
            },


            async set(obj) {
                try {
                    if (!chrome?.runtime?.id) {
                        this._clearPendingWrites();
                        return;
                    }

                    /* 新增：将大对象 folders 拆分存储 */
                    if (obj.folders) {
                        const folders = obj.folders;
                        const folderKeys = Object.keys(folders);
                        const out = {folderKeys};
                        const MAX_BYTES = 6 * 1024; // 留安全余量，低于 8KB

                        function sizeOf(v) {
                            return JSON.stringify(v).length;
                        }

                        function packOne(id, data) {
                            const {name = 'Group', collapsed = false, prompts = [], chats = [], gap = 0} = data || {};
                            const base = {name, collapsed, prompts, gap};
                            const baseCost = sizeOf({...base, chats: []});
                            let buf = [];
                            let used = baseCost;
                            let parts = 0;

                            const flush = () => {
                                if (!buf.length) return;
                                out[`f_${id}__p${parts}`] = {chats: buf};
                                parts += 1;
                                buf = [];
                                used = baseCost;
                            };

                            for (const c of chats) {
                                const inc = sizeOf(c) + 2; // 粗略计入逗号等开销
                                if (used + inc > MAX_BYTES && buf.length) flush();
                                buf.push(c);
                                used += inc;
                            }
                            flush();

                            out[`f_${id}__meta`] = {...base, parts};
                            // 兼容清理旧单块键
                            out[`f_${id}`] = undefined;
                        }

                        folderKeys.forEach(id => packOne(id, folders[id]));
                        delete obj.folders;
                        Object.assign(obj, out);
                    }


                    // 检查未处理队列大小，避免过度积累
                    if (Object.keys(this._pendingWrites).length > this._maxPendingSize) {
                        console.warn('[Bookmark] Too many pending writes, forcing flush');
                        this._clearPendingWrites();
                    }

                    // 合并待写入数据
                    Object.assign(this._pendingWrites, obj);

                    // 清除现有定时器
                    clearTimeout(this._writeTimer);

                    // 计算下次写入时间
                    const now = Date.now();
                    const timeSinceLastWrite = now - this._lastWriteTime;
                    const delay = timeSinceLastWrite < this._minInterval ?
                        this._writeDelay :
                        Math.min(this._writeDelay, 200); // 如果距离上次写入已经很久，可以更快写入

                    // 设置新定时器
                    this._writeTimer = setTimeout(async () => {
                        try {
                            const dataToWrite = {...this._pendingWrites};        // 先备份待写数据
                            await chrome.storage.sync.set(dataToWrite);          // 成功后再清空队列
                            this._pendingWrites = {};

                            this._lastWriteTime = Date.now();
                            this._retryCount = 0; // 重置重试计数
                        } catch (e) {
                            if (e?.message?.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {      // 新增：写入过频
                                console.warn('[Bookmark] Too many writes, backing off:', e);
                                this._retryWrite(Math.max(delay * 2, 60000));                   // 至少等待 60 s
                            } else if (
                                (e && typeof e.message === 'string' &&
                                    /QUOTA_BYTES_PER_ITEM|QUOTA_BYTES|kQuotaBytesPerItem|quota exceeded/i.test(e.message)) ||
                                e?.name === 'QuotaExceededError'
                            ) {
                                console.warn('[Bookmark] Storage quota exceeded:', e);
                                this._handleQuotaError();
                            } else {
                                console.warn('[Bookmark] storage.set error', e);
                                this._retryWrite(delay * 2);
                            }
                        }

                    }, delay);
                } catch (e) {
                    console.warn('[Bookmark] Error setting up storage write:', e);
                    this._clearPendingWrites();
                }
            },

            // 添加处理配额超出的方法
            _handleQuotaError() {
                console.warn('[Bookmark] Trying to recover from quota error');
                // 清空当前挂起的写入
                this._clearPendingWrites();

                // 保存关键数据 - 最小化数据体积
                if (folders) {
                    try {
                        // 只保存基本结构，丢弃过大的数据
                        const minimalFolders = {};
                        Object.entries(folders).forEach(([id, folder]) => {
                            // 保留最多10个聊天
                            const limitedChats = (folder.chats || []).slice(0, 10).map(chat => ({
                                url: chat.url,
                                title: (chat.title || '').slice(0, 50) // 限制标题长度
                            }));

                            minimalFolders[id] = {
                                name: folder.name || 'Group',
                                chats: limitedChats,
                                collapsed: folder.collapsed || false,
                                prompts: (folder.prompts || []).slice(0, MAX_PROMPTS).map(p => p.slice(0, 100)),
                                gap: Number.isFinite(folder.gap) ? folder.gap : 0
                            };
                        });

                        // 尝试直接写入精简版数据
                        setTimeout(async () => {
                            try {
                                await storage.set({folders: minimalFolders}); // 会自动拆分为 folderKeys + f_<id>
                                console.log('[Bookmark] Saved minimal version of folders');
                            } catch (err) {
                                console.error('[Bookmark] Failed to save minimal folders:', err);
                            }
                        }, 1000);
                    } catch (err) {
                        console.error('[Bookmark] Error creating minimal folders:', err);
                    }
                }
            },

            _clearPendingWrites() {
                this._pendingWrites = {};
                clearTimeout(this._writeTimer);
            },

            _retryWrite(delay) {
                if (this._retryCount < this._maxRetries) {
                    this._retryCount++;
                    console.log(`[Bookmark] Retrying write (${this._retryCount}/${this._maxRetries})`);
                    clearTimeout(this._writeTimer);
                    this._writeTimer = setTimeout(async () => {
                        try {
                            const dataToWrite = {...this._pendingWrites};          // 先备份，成功后再清空
                            await chrome.storage.sync.set(dataToWrite);
                            this._pendingWrites = {};
                            this._lastWriteTime = Date.now();
                            this._retryCount = 0;
                        } catch (e) {
                            console.warn(`[Bookmark] Retry ${this._retryCount} failed:`, e);

                            if (e?.message?.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {     // 新增：写入过频
                                this._retryWrite(Math.max(delay * 2, 60000));                  // 强制 60 s 退避
                                return;
                            }

                            if (this._retryCount >= this._maxRetries) {
                                console.warn('[Bookmark] Max retries reached, will retry later with back-off');
                                this._retryCount = 0;
                                this._retryWrite(Math.min(delay * 2, 60000));                  // 指数退避
                            } else {
                                this._retryWrite(delay * 1.5);
                            }
                        }
                    }, delay);
                } else {
                    console.error('[Bookmark] Max retries reached, clearing pending writes');
                    this._clearPendingWrites();
                }
            }
        };

        /* ===== 提示气泡 ===== */
        const TIP_ID = 'cgpt-tip-style';                                              // 样式元素 id
        if (!document.getElementById(TIP_ID)) {                                                   // 若未注入则注入
            const s = document.createElement('style');             // 创建 style
            s.id = TIP_ID;                                                                        // 赋 id
            s.textContent = `.${CLS.tip}{position:fixed;z-index:2147483647;padding:6px 10px;border-radius:6px;font-size:12px;background:#333;color:#fff;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.12);animation:fade .15s both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1}}`;
            document.head.appendChild(s);                                                         // 注入
        }
        const tip = (el, txt) => {
            // 先清除页面上所有可能残留的气泡，避免重复或卡死
            document.querySelectorAll(`.${CLS.tip}`).forEach(node => node.remove());
            const d = Object.assign(document.createElement('div'), {
                className: CLS.tip,
                innerText: txt      // 改为 innerText，配合下面样式可保留换行
            });
            // 以下三行用于开启自动换行，并限制最大宽度
            d.style.whiteSpace = 'pre-wrap';
            d.style.wordBreak = 'break-word';
            d.style.maxWidth = '200px';
            document.body.appendChild(d);
            const r = el.getBoundingClientRect();
            d.style.left = r.left + r.width / 2 - d.offsetWidth / 2 + 'px';
            d.style.top = r.top - d.offsetHeight - 6 + 'px';
            // 安全保险：3 秒后自动销毁，防止意外卡死
            const timer = setTimeout(() => d.remove(), 3000);
            // 鼠标移出目标元素时立即销毁
            el.addEventListener('mouseleave', () => {
                clearTimeout(timer);
                d.remove();
            }, {once: true});
            return () => {
                clearTimeout(timer);
                d.remove();
            };
        };


        /* ===== 全局数据 ===== */
        let folders = {};
        let lastActiveMap = {};

        // 从 sessionStorage 读取旧值, 若无或解析失败则回落为空对象
        window.__cgptPromptGapCounters = (() => {
            try {
                return JSON.parse(sessionStorage.getItem('cgptPromptGapCounters') || '{}');
            } catch {
                return {};
            }
        })();

        // 新增：多提示词轮询索引映射
        window.__cgptPromptIndexMap = (() => {
            try {
                return JSON.parse(sessionStorage.getItem('cgptPromptIndexMap') || '{}');
            } catch {
                return {};
            }
        })();

        function bootAfterHydration() {
            const start = () => {
                const readyObs = observers.add(new MutationObserver(debounce(() => {
                    const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');

                    const wrappers = qsa('#cgpt-bookmarks-wrapper');
                    if (wrappers.length > 1) {
                        wrappers.slice(1).forEach(w => w.remove());
                    }

                    const wrapper = wrappers[0];

                    if (hist && wrapper && hist.parentElement && wrapper.parentElement !== hist.parentElement) {
                        try {
                            hist.parentElement.insertBefore(wrapper, hist);
                        } catch (e) {
                            console.warn('[Bookmark] Failed to relocate wrapper:', e);
                        }
                    }

                    const selHeader = qs('#cgpt-select-header');
                    if (hist && selHeader) {
                        const chatsAside = hist.querySelector('aside[aria-labelledby]') || hist;
                        const chatsH2 = chatsAside.querySelector('h2') || chatsAside.firstChild;
                        if (selHeader.parentElement !== chatsAside || selHeader.nextSibling !== chatsH2) {
                            try {
                                chatsAside.insertBefore(selHeader, chatsH2);
                            } catch (e) {
                                console.warn('[Bookmark] Failed to relocate select header:', e);
                            }
                        }
                    }
                    if (!hist && wrapper) {
                        try {
                            wrapper.remove()
                        } catch {
                        }
                        return;                         // ← 仅删除 startBookmarksWatchdog?.()
                    }

                    if (hist && !wrapper) {
                        if (!window.__cgptCreatingBookmarks) {
                            window.__cgptCreatingBookmarks = true; // 哨兵启动
                            initBookmarks(hist)
                                .catch(err => console.error('initBookmarks error:', err))
                                .finally(() => {
                                    window.__cgptCreatingBookmarks = false;

                                    // 再次去重，防止并发情况下残留多余 wrapper
                                    const all = qsa('#cgpt-bookmarks-wrapper');
                                    if (all.length > 1) {
                                        all.slice(1).forEach(w => {
                                            try {
                                                w.remove();
                                            } catch {
                                            }
                                        });
                                    }
                                });
                        }
                    }
                }, 80)));
                readyObs.observe(document.body, {childList: true, subtree: true});
            };
            const idle = (cb) => (window.requestIdleCallback || ((f) => setTimeout(f, 120)))(cb);
            if (document.readyState === 'complete') {
                idle(start);
            } else {
                window.addEventListener('load', () => idle(start), {once: true, passive: true});
            }
        }

// 替换直接 observe 的做法：延后到 load+idle 再启动
        bootAfterHydration();


        /* ===== 初始化收藏夹 ===== */
        async function initBookmarks(historyNode) {
            function insertMultiSelectHeader(root) {
                /* 若块已存在就搬到 div#history 之上，避免重复创建 */
                const exist = document.getElementById('cgpt-select-header');
                const chatsAside = root.querySelector('aside[aria-labelledby]') || root;
                const chatsH2 = chatsAside.querySelector('h2') || chatsAside.firstChild;
                if (exist) {
                    // 目标：始终位于 Chats 标题正上方
                    if (exist.parentElement !== chatsAside || exist.nextSibling !== chatsH2) {
                        chatsAside.insertBefore(exist, chatsH2);
                    }
                    return;
                }

                // 外层 aside（宽度缩减，与分组列表项对齐）
                const aside = document.createElement('aside');
                aside.id = 'cgpt-select-header';
                aside.style.cssText = 'margin:0 12px 4px;width:calc(100% - 24px)';

                // 内层工具条
                const bar = document.createElement('div');
                bar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.05)';
                // 全选复选框
                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.style.cssText = 'accent-color:#10a37f;cursor:pointer';
                bar.appendChild(toggle);

                // 批量处理文字
                const batchLabel = document.createElement('span');
                batchLabel.textContent = 'Batch Processing';
                batchLabel.style.cssText = 'font-size:13px;color:white';
                bar.appendChild(batchLabel);

                // 右侧省略号
                const menuBtn = document.createElement('span');
                menuBtn.textContent = '⋯';
                menuBtn.style.cssText = 'margin-left:auto;font-size:18px;cursor:pointer;line-height:1';
                bar.appendChild(menuBtn);

                aside.appendChild(bar);
                chatsAside.insertBefore(aside, chatsH2);
                /* === 交互 === */

                // ① 全选 / 取消全选
                toggle.addEventListener('change', () => {
                    const boxes = root.querySelectorAll('input.history-checkbox');
                    boxes.forEach(cb => {
                        cb.checked = toggle.checked;
                        cb.dispatchEvent(new Event('change'));       // 触发 batch_delete.js 内的存储同步
                    });
                });

                // ② 弹出菜单
                const pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;display:none;flex-direction:column;min-width:120px;background:#2b2b2b;border-radius:6px;padding:4px 0;z-index:9999';
                document.body.appendChild(pop);

                function hide() {
                    pop.style.display = 'none';
                }

                window.addEventListener('click', e => {
                    if (!menuBtn.contains(e.target) && !pop.contains(e.target)) hide();
                }, true);

                menuBtn.addEventListener('click', () => {
                    if (pop.style.display === 'block') {
                        hide();
                        return;
                    }
                    pop.innerHTML = '';
                    const entry = document.createElement('div');
                    entry.textContent = 'groups';
                    entry.style.cssText = 'padding:0px 12px;cursor:pointer;white-space:nowrap';
                    pop.appendChild(entry);

                    // 新增：Delete
                    const delEntry = document.createElement('div');
                    delEntry.textContent = 'Delete';
                    delEntry.style.cssText = 'padding:4px 12px;cursor:pointer;white-space:nowrap';
                    pop.appendChild(delEntry);

                    const r = menuBtn.getBoundingClientRect();
                    const pLeft = Math.max(0, Math.min(r.right - 120, window.innerWidth - 120));
                    pop.style.left = `${pLeft}px`;
                    pop.style.top = `${r.bottom + 4}px`;
                    pop.style.display = 'block';

                    entry.onclick = () => {
                        showGroupList(r);
                        hide();
                    };

                    // 最小化工具函数，仅作用于本弹框
                    function idFromUrl(url) {
                        const m = /\/c\/([^/?#]+)/.exec(url);
                        return m ? m[1] : url;
                    }

                    function buildAcceptLanguage() {
                        const ls = (Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || 'en-US'])
                            .map(s => String(s || '').split(';')[0])
                            .filter(Boolean);
                        const uniq = [...new Set(ls)].slice(0, 4);
                        if (!uniq.length) return 'en-US,en;q=0.9';
                        const qs = [1.0, 0.9, 0.8, 0.7];
                        return uniq.map((l, i) => i === 0 ? l : `${l};q=${qs[i].toFixed(1)}`).join(',');
                    }

                    async function getHeaders() {
                        const h = {
                            accept: '*/*',
                            'accept-language': buildAcceptLanguage(),
                            'content-type': 'application/json'
                        };
                        try {
                            const res = await fetch('/api/auth/session', {credentials: 'same-origin'});
                            if (res.ok) {
                                const data = await res.json();
                                if (data && data.accessToken) h.authorization = `Bearer ${data.accessToken}`;
                            }
                        } catch {
                        }
                        return h;
                    }

                    delEntry.onclick = async () => {
                        const chosen = [...root.querySelectorAll('a.__menu-item[href*="/c/"]')]
                            .filter(a => a.querySelector('input.history-checkbox')?.checked);
                        const ids = chosen.map(a => idFromUrl(a.href));
                        if (!ids.length) {
                            hide();
                            return;
                        }

                        // 新增：确认弹框，防止误触
                        const count = ids.length;
                        const ok = window.confirm(
                            count === 1
                                ? 'Delete this conversation?'
                                : `Delete ${count} selected conversations?`
                        );
                        if (!ok) {
                            hide();
                            return;
                        }

                        // 1) 构建“删除中”遮罩与动画，阻止任何交互
                        const OVERLAY_ID = 'cgpt-batch-deleting-overlay';
                        const STYLE_ID = 'cgpt-batch-deleting-style';

                        function showDeletingOverlay(total) {
                            if (!document.getElementById(STYLE_ID)) {
                                const s = document.createElement('style');
                                s.id = STYLE_ID;
                                s.textContent =
                                    '@keyframes cgptSpin{to{transform:rotate(360deg)}}' +
                                    `#${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}` +
                                    `#${OVERLAY_ID} .box{display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 18px;border-radius:10px;background:rgba(34,34,34,.9);backdrop-filter:saturate(120%) blur(2px);color:#fff;font-size:14px}` +
                                    `#${OVERLAY_ID} .spin{width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;animation:cgptSpin .8s linear infinite}`;
                                document.head.appendChild(s);
                            }
                            const o = document.createElement('div');
                            o.id = OVERLAY_ID;
                            // 让现有恢复指针事件的逻辑识别到“有遮罩在”
                            o.setAttribute('role', 'dialog');
                            o.setAttribute('aria-modal', 'true');
                            o.dataset.state = 'open';

                            const box = document.createElement('div');
                            box.className = 'box';
                            const spin = document.createElement('div');
                            spin.className = 'spin';
                            const text = document.createElement('div');
                            text.className = 'txt';
                            text.textContent = total > 1 ? `Deleting 0/${total}` : 'Deleting...';
                            box.append(spin, text);
                            o.appendChild(box);

                            // 拦截所有输入
                            o.addEventListener('keydown', e => e.preventDefault(), true);
                            o.addEventListener('click', e => e.preventDefault(), true);
                            o.addEventListener('pointerdown', e => e.preventDefault(), true);
                            document.body.appendChild(o);
                            return {
                                update(n) {
                                    text.textContent = total > 1 ? `Deleting ${n}/${total}` : 'Deleting...';
                                },
                                close() {
                                    try {
                                        o.remove();
                                    } catch {
                                    }
                                }
                            };
                        }

                        const overlay = showDeletingOverlay(ids.length);

                        try {
                            // 2) 获取头信息
                            const headers = await getHeaders();

                            try {
                                const curPath = location.pathname.split('?')[0];
                                const deletingCurrent = Array.isArray(ids) && ids.some(id => curPath === `/c/${id}`);
                                if (deletingCurrent) {
                                    softGoHome(); // 优先点击 New chat，其次 history.pushState
                                }
                            } catch {
                            }
                            let done = 0;
                            const tasks = ids.map(id =>
                                fetch(`/backend-api/conversation/${id}`, {
                                    method: 'PATCH',
                                    headers,
                                    body: JSON.stringify({is_visible: false})
                                }).catch(() => null).finally(() => {
                                    done += 1;
                                    overlay.update(done);
                                })
                            );
                            await Promise.allSettled(tasks);


                            // 4) 清理历史面板 DOM
                            if (window.clearHistoryMultiSelected) window.clearHistoryMultiSelected();
                            chosen.forEach(a => {
                                const li = a.closest('li');
                                const node = li || a;
                                node.setAttribute('data-cgpt-soft-deleted', '1');
                                node.style.display = 'none';
                            });
                            const toggleAll = document.querySelector('#cgpt-select-header input[type="checkbox"]');
                            if (toggleAll) toggleAll.checked = false;

                            // 5) 同步剔除分组中对应会话，并局部重绘受影响的组（保持原逻辑）
                            try {
                                const delPaths = new Set(ids.map(id => `/c/${id}`));
                                let changed = false;
                                const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(3)');
                                const fidList = Object.keys(folders);

                                for (const [fid, folder] of Object.entries(folders)) {
                                    const oldChats = Array.isArray(folder.chats) ? folder.chats : [];
                                    const newChats = oldChats.filter(c => {
                                        try {
                                            const p = new URL(c.url, location.origin).pathname;
                                            return !delPaths.has(p);
                                        } catch {
                                            return true;
                                        }
                                    });
                                    if (newChats.length !== oldChats.length) {
                                        folder.chats = newChats;
                                        changed = true;
                                        const idx = fidList.indexOf(fid);
                                        const oldBox = folderZone?.children?.[idx];
                                        if (oldBox) {
                                            const newBox = renderFolder(fid, folder);
                                            folderZone.replaceChild(newBox, oldBox);
                                        }
                                    }
                                }

                                if (changed) {
                                    delPaths.forEach(p => {
                                        try {
                                            removeChatDom(p);
                                        } catch {
                                        }
                                        if (lastActiveMap[p]) delete lastActiveMap[p];
                                    });
                                    if (chrome?.runtime?.id) {
                                        storage.set({lastActiveMap});
                                        storage.set({folders});
                                    }
                                    safeSendMessage({type: 'save-folders', data: folders});
                                    highlightActive();
                                }
                            } catch (e) {
                                console.warn('[Bookmark] Batch delete sync error:', e);
                            }
                        } finally {
                            // 6) 若当前所处会话被删除，返回 New chat
                            try {
                                const cur = location.pathname.split('?')[0];
                                const deleted = Array.isArray(ids) && ids.some(id => cur === `/c/${id}`);
                                if (deleted) {
                                    try {
                                        window.__cgptPendingFid = null;
                                        window.__cgptPendingToken = null;
                                        const counters = window.__cgptPromptGapCounters || {};
                                        const indices = window.__cgptPromptIndexMap || {};
                                        delete counters['/'];
                                        delete indices['/'];
                                        sessionStorage.setItem('cgptPromptGapCounters', JSON.stringify(counters));
                                        sessionStorage.setItem('cgptPromptIndexMap', JSON.stringify(indices));
                                    } catch {
                                    }

                                    // 软跳转：优先点击现有“New chat”入口，其次用 pushState
                                    const softGoHome = () => {
                                        const btn =
                                            qs('a[href="/"]') ||
                                            qs('a[aria-label*="New chat" i]') ||
                                            qs('a[data-testid="new-chat-button"]');
                                        if (btn) {
                                            try {
                                                window.__cgptIgnoreNextHistoryClick = true;
                                                btn.click();
                                                setTimeout(() => {
                                                    window.__cgptIgnoreNextHistoryClick = false;
                                                }, 500);
                                                return true;
                                            } catch {
                                            }
                                        }
                                        try {
                                            history.pushState(null, '', '/');
                                            window.dispatchEvent(new PopStateEvent('popstate'));
                                            return true;
                                        } catch {
                                        }
                                        return false;
                                    };
                                    softGoHome();
                                    // 不再使用 location.replace('/')
                                }

                            } catch {
                            }

                            // 6) 关闭遮罩并收起菜单
                            overlay.close();
                            hide();
                        }

                    };

                });

                // ③ 选择目标分组
                function showGroupList(bRect) {
                    const list = document.createElement('div');
                    list.style.cssText = 'position:fixed;display:flex;flex-direction:column;min-width:140px;background:#2b2b2b;border-radius:6px;padding:4px 0;z-index:10000';
                    document.body.appendChild(list);

                    const r = bRect || menuBtn.getBoundingClientRect();
                    const gLeft = Math.max(0, Math.min(r.right - 140, window.innerWidth - 140));
                    list.style.left = `${gLeft}px`;
                    list.style.top = `${r.bottom + 4}px`;

                    Object.entries(folders).forEach(([, f]) => {
                        const row = document.createElement('div');
                        row.textContent = f.name || 'Group';
                        row.style.cssText = 'padding:4px 12px;cursor:pointer;white-space:nowrap';
                        row.onclick = () => {
                            // showGroupList → row.onclick 内
                            const chosen = [...root.querySelectorAll('a.__menu-item[href*="/c/"]')]
                                .filter(a => a.querySelector('input.history-checkbox')?.checked);

                            // 按 Chats 中的出现顺序收集需要新增的项
                            const toPrepend = [];
                            chosen.forEach(a => {
                                const url = a.href;
                                const title = (a.textContent || 'Chat').trim();
                                if (!f.chats.some(c => samePath(c.url, url))) {
                                    toPrepend.push({url, title});
                                }
                            });

                            if (toPrepend.length) {
                                f.chats = [...toPrepend, ...f.chats];
                            }

                            if (window.clearHistoryMultiSelected) window.clearHistoryMultiSelected();
                            const toggleAll = document.querySelector('#cgpt-select-header input[type="checkbox"]');
                            if (toggleAll) toggleAll.checked = false;

                            if (chrome?.runtime?.id) {
                                storage.set({folders});                    // 新增：真正写入 storage
                                safeSendMessage({type: 'save-folders', data: folders}); // 保持与后台同步
                            }

                            render();
                            list.remove();
                        };
                        list.appendChild(row);
                    });

                    /* 延后一帧再注册“点击空白处关闭”监听，防止刚打开就被同一次点击关掉 */
                    setTimeout(() => {
                        window.addEventListener('click', () => {
                            if (document.body.contains(list)) list.remove();
                        }, {once: true});
                    }, 0);

                }
            }


            /* ---------- 辅助函数 ---------- */
            let activePath = null;
            let activeFid = null;
            let lastClickedChatEl = null;
            let clearActiveOnHistoryClick = false;
            let currentNewChatObserver = null;
            let currentNewChatPopHandler = null;
            const historyClickHandler = e => {
                if (e.target && e.target.closest('input.history-checkbox, .__menu-item-trailing-btn, [data-trailing-button], button, [role="menu"], [role="menuitem"], [role="button"]')) {
                    return;
                }
                const a = e.target.closest('a[href*="/c/"]');
                if (!a) return;
                if (window.__cgptIgnoreNextHistoryClick) return;

                // 标记该会话“来自 Chats”，禁止为其点亮组角标
                try {
                    const p = new URL(a.href, location.origin).pathname;
                    lastActiveMap[p] = '__history__';
                    if (chrome?.runtime?.id) storage.set({ lastActiveMap });
                } catch {}

                clearActiveOnHistoryClick = true;
                lastClickedChatEl = null;
                setTimeout(() => { clearActiveOnHistoryClick = false; }, 300);

                // 立即清空组选中态并刷新
                activeFid = null;
                setTimeout(highlightActive, 0);
            };


            historyNode._folderClickHandler = historyClickHandler; // 存储引用以便后续移除
            historyNode.addEventListener('click', historyClickHandler);

            // 多选头部块 ─ 初始化
            insertMultiSelectHeader(historyNode);        // ← 新增

            // 检查是否已有书签容器
            const existingWrapper = qs('#cgpt-bookmarks-wrapper');
            if (existingWrapper) {
                // 若已有容器且位置不在 historyNode 同一父节点，则移动到正确位置
                const host2 = historyNode?.parentElement;
                if (host2 && existingWrapper.parentElement !== host2) {
                    try {
                        host2.insertBefore(existingWrapper, historyNode);
                    } catch (e) {
                        console.warn('[Bookmark] Failed to relocate existing wrapper:', e);
                    }
                }
                return;
            }

            /* ---------- DOM 构建 ---------- */
            const wrap = Object.assign(document.createElement('div'), {
                id: 'cgpt-bookmarks-wrapper', style: 'width:100%;margin-bottom:4px'
            });
            const inner = Object.assign(document.createElement('div'), {style: 'padding:4px 0'});
            // …（后续创建 fontBlock、bar、folderZone 等）…

            /* ---------- 新增：页面字体与字号选择块 ---------- */
            const fontBlock = Object.assign(document.createElement('div'), {
                style: 'display:flex;align-items:center;gap:8px;padding:4px 12px 0'
            });
            const fontLabel = Object.assign(document.createElement('span'), {
                textContent: 'Font:',
                style: 'font-size:14px'
            });
            const fontSelect = Object.assign(document.createElement('select'), {
                style: [
                    'flex:1',
                    'max-width: 65px',
                    'font-size:12px',
                    'padding:0 20px 0 8px',
                    'height:24px',
                    'background-color:rgb(23,22,22)',
                    'color:#fff',
                    'border:none',
                    'appearance:none',
                    '-webkit-appearance:none',
                    '-moz-appearance:none',
                    'background-repeat:no-repeat',
                    'background-position:right 8px center',
                    'border-radius:6px'
                ].join(';')
            });

            const sizeLabel = Object.assign(document.createElement('span'), {
                textContent: 'Size:',
                style: 'font-size:14px'
            });
            const sizeSelect = Object.assign(document.createElement('select'), {
                style: [
                    'width:88px',
                    'font-size:12px',
                    'padding:0 20px 0 8px',
                    'height:24px',
                    'background-color:rgb(23,22,22)',
                    'color:#fff',
                    'border:none',
                    'appearance:none',
                    '-webkit-appearance:none',
                    '-moz-appearance:none',
                    'background-repeat:no-repeat',
                    'background-position:right 8px center',
                    'border-radius:6px'
                ].join(';')
            });

            // 原有字体选项保持不变
            ['inherit', 'serif', 'SimSun', 'SimHei', 'Microsoft YaHei', 'Segoe UI', 'Arial'].forEach(f => {
                const o = document.createElement('option');
                o.value = f;
                o.textContent = f;
                fontSelect.appendChild(o);
            });

            // 新增 Size：预设百分比
            ['80%', '85%', '90%', '95%', '100%'].forEach(p => {
                const o = document.createElement('option');
                o.value = p;
                o.textContent = p;
                sizeSelect.appendChild(o);
            });

            // 事件：设置字体
            fontSelect.addEventListener('change', e => {
                document.documentElement.style.fontFamily = e.target.value;
                if (chrome?.runtime?.id) storage.set({pageFont: e.target.value});
            });

            // 事件：设置字号
            sizeSelect.addEventListener('change', e => {
                const v = e.target.value || '100%';
                document.documentElement.style.fontSize = v;
                if (chrome?.runtime?.id) storage.set({pageFontSize: v});
            });

            // 初始化：恢复字体与字号
            await (async () => {
                const savedFont = await storage.get('pageFont');
                if (savedFont) {
                    fontSelect.value = savedFont;
                    document.documentElement.style.fontFamily = savedFont;
                }
                const savedSize = await storage.get('pageFontSize');     // 新增 Size
                const applied = typeof savedSize === 'string' && savedSize.endsWith('%') ? savedSize : '100%';
                sizeSelect.value = applied;
                document.documentElement.style.fontSize = applied;
            })();

            // 组装：Font 与 Size 并排显示
            fontBlock.append(fontLabel, fontSelect, sizeLabel, sizeSelect);

            const bar = Object.assign(document.createElement('div'), {
                textContent: 'Groups', style: 'display:flex;align-items:center;font:350 13px/1 white;padding:4px 12px'
            });

// 三点菜单按钮
            const addBtn = Object.assign(document.createElement('span'), {
                textContent: '⋯',
                style: 'color:white;cursor:pointer;margin-left:auto;font-size:18px;line-height:1'
            });
            bar.appendChild(addBtn);

// —— 把原来 “+” 的逻辑封装为函数 ——
            function addGroup() {
                const raw = prompt('Group name', '');
                if (!raw) return;
                const name = raw.trim();
                if (!name) return;

                const fid = 'grp_' + nanoid();
                folders[fid] = {
                    name: name.length > 20 ? name.slice(0, 20) + '…' : name,
                    chats: [],
                    collapsed: true,
                    prompts: [],
                    gap: 0
                };

                const order = Object.keys(folders);
                if (chrome?.runtime?.id) {
                    storage.set({folders, folderOrder: order});
                    safeSendMessage({type: 'save-folders', data: folders});
                }
                render();
            }

// —— 导出 / 导入 ——
            async function doExport() {
                // 取当前页面实时 Font/Size，若为空再回退存储
                const font = document.documentElement.style.fontFamily || (await storage.get('pageFont')) || '';
                const size = document.documentElement.style.fontSize || (await storage.get('pageFontSize')) || '100%';
                const payload = {
                    type: 'cgpt-groups-backup',
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    pageFont: font,
                    pageFontSize: size,
                    folders
                };
                const blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
                const a = document.createElement('a');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                a.download = `cgpt_groups_backup_${ts}.json`;
                a.href = URL.createObjectURL(blob);
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(a.href);
                    a.remove();
                }, 0);
            }

            function doImport() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.onchange = async () => {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const obj = JSON.parse(text);
                        if (!obj || obj.type !== 'cgpt-groups-backup' || typeof obj.folders !== 'object') {
                            alert('Invalid backup file');
                            return;
                        }

                        // 应用分组
                        folders = obj.folders || {};
                        const order = Object.keys(folders);

                        // 应用 Font/Size 到页面与下拉框
                        const fnt = obj.pageFont || 'inherit';
                        const sz = (typeof obj.pageFontSize === 'string' && obj.pageFontSize.endsWith('%')) ? obj.pageFontSize : '100%';
                        document.documentElement.style.fontFamily = fnt;
                        document.documentElement.style.fontSize = sz;
                        try {
                            fontSelect.value = fnt;
                        } catch {
                        }
                        try {
                            sizeSelect.value = sz;
                        } catch {
                        }

                        if (chrome?.runtime?.id) {
                            await storage.set({folders, folderOrder: order});
                            await storage.set({pageFont: fnt, pageFontSize: sz});
                            safeSendMessage({type: 'save-folders', data: folders});
                        }
                        render();
                    } catch {
                        alert('Import failed');
                    }
                };
                input.click();
            }

// —— 弹出菜单（add group / Export / Import）——
            const pop = document.createElement('div');
            pop.style.cssText = 'position:fixed;display:none;flex-direction:column;min-width:140px;background:#2b2b2b;border-radius:8px;padding:6px 0;z-index:2147483647';
            document.body.appendChild(pop);

            function hideMenu() {
                pop.style.display = 'none';
            }

            window.addEventListener('click', e => {
                if (!addBtn.contains(e.target) && !pop.contains(e.target)) hideMenu();
            }, true);

            addBtn.addEventListener('click', async () => {
                if (pop.style.display === 'block') {
                    hideMenu();
                    return;
                }
                pop.innerHTML = '';

                const mkItem = (txt, handler, danger) => {
                    const d = document.createElement('div');
                    d.textContent = txt;
                    d.style.cssText = `padding:6px 12px;cursor:pointer;white-space:nowrap${danger ? ';color:#e66' : ''}`;
                    d.onclick = () => {
                        handler();
                        hideMenu();
                    };
                    return d;
                };

                pop.appendChild(mkItem('add group', addGroup));
                pop.appendChild(mkItem('Export', doExport));
                pop.appendChild(mkItem('Import', doImport));

                const r = addBtn.getBoundingClientRect();
                const left = Math.max(0, Math.min(r.right - 160, window.innerWidth - 160));
                pop.style.left = `${left}px`;
                pop.style.top = `${r.bottom + 4}px`;
                pop.style.display = 'block';
            });


            const folderZone = Object.assign(document.createElement('div'), {style: 'padding:0 12px'});
            /* 关键：调整插入顺序——先字体块，再 Groups 标题，再分组列表 */
            inner.append(fontBlock, bar, folderZone);
            wrap.appendChild(inner);

            // 插入 bookmarks wrapper 于最顶 —— 加防护与早退
            const host = historyNode?.parentElement;
            try {
                if (host && host.isConnected && historyNode.isConnected) {
                    host.insertBefore(wrap, historyNode);
                } else {
                    // 节点可能在路由/水合过程中被卸载；本轮放弃，交由上层观察器下一轮重试
                    return;
                }
            } catch (e) {
                console.warn('[Bookmark] Safe insert failed, will retry later:', e);
                return;
            }

            // 重新定位多选头部块到 history 与 bookmarks wrapper 之间
            const selHeader = document.getElementById('cgpt-select-header');
            // 新增：当“Groups”组的条目元素整体消失时，整页刷新
            (function setupGroupLossReload() {
                const ZONE_SEL = '#cgpt-bookmarks-wrapper > div > div:nth-child(3)';
                let armed = false;      // 仅当曾出现过至少 1 个组条目后才“武装”
                let reloading = false;  // 确保只刷新一次
                let missingTimer = null; // 新增：延迟确认用

                const getZone = () => document.querySelector(ZONE_SEL);
                const countGroups = (z) => z ? z.querySelectorAll(':scope > div').length : 0;

                const tryArm = () => {
                    const z = getZone();
                    if (z && countGroups(z) > 0) armed = true;
                };

                const reloadOnce = () => {
                    if (reloading) return;
                    reloading = true;
                    location.reload();
                };

                // 新增：统一的“2秒后仍缺失才刷新”调度器
                const cancelConfirm = () => {
                    if (missingTimer) {
                        clearTimeout(missingTimer);
                        missingTimer = null;
                    }
                };
                const confirmLater = (predicate) => {
                    cancelConfirm();
                    missingTimer = setTimeout(() => {
                        try {
                            if (predicate()) reloadOnce();
                        } finally {
                            missingTimer = null;
                        }
                    }, 1500);
                };

                // 监听 folderZone 自身的子列表变化（组条目缺失→延迟确认）
                const mo = new MutationObserver(() => {
                    const z = getZone();
                    if (!z) return;              // zone 暂未挂载
                    if (!armed) {
                        tryArm();
                        return;
                    }
                    const n = countGroups(z);
                    if (n === 0) {
                        // 2秒后若仍为0则刷新；期间若恢复则取消
                        confirmLater(() => {
                            const z2 = getZone();
                            return !!z2 && countGroups(z2) === 0;
                        });
                    } else {
                        // 一旦恢复，取消可能存在的延迟刷新
                        cancelConfirm();
                    }
                });

                const start = () => {
                    const z = getZone();
                    if (!z) return;
                    tryArm();
                    mo.observe(z, {childList: true});
                };

                // 兜底：wrapper 自身被移除也采用“2秒确认后再刷新”
                const moBody = new MutationObserver(() => {
                    const stillMissingWrapper = () => !document.querySelector('#cgpt-bookmarks-wrapper');
                    if (stillMissingWrapper()) {
                        confirmLater(stillMissingWrapper);
                    } else {
                        cancelConfirm();
                    }
                });
                moBody.observe(document.body, {childList: true, subtree: true});

                // 初次尝试启动；若 zone 尚未就绪，短暂轮询几次
                start();
                let tries = 0;
                const timer = setInterval(() => {
                    if (getZone()) {
                        clearInterval(timer);
                        start();
                    } else if (++tries >= 10) clearInterval(timer);
                }, 300);
            })();

            if (selHeader) {
                const chatsAside = historyNode.querySelector('aside[aria-labelledby]') || historyNode;
                const chatsH2 = chatsAside.querySelector('h2') || chatsAside.firstChild;
                chatsAside.insertBefore(selHeader, chatsH2);
            }
            /* ---------- 数据读取 ---------- */
            const storedFolders = (await storage.get('folders')) || {};
            const storedOrder = (await storage.get('folderOrder')) || Object.keys(storedFolders);

            // 若 storage 仍为空但全局 folders 已有内容(首次安装后立即缩小窗口)则回退到内存版本
            const baseFolders = Object.keys(storedFolders).length ? storedFolders : folders;
            const order = storedOrder.length ? storedOrder : Object.keys(baseFolders);

            // 保留旧内存中的有效 gap，内存优先，其次 storage，最后 0
            const prevFolders = folders;
            folders = {};
            order.forEach(fid => {
                if (!baseFolders[fid]) return;
                const next = baseFolders[fid];
                const old = prevFolders?.[fid] || {};
                const mergedGap = Number.isFinite(next.gap)
                    ? next.gap
                    : (Number.isFinite(old.gap) ? old.gap : 0);
                folders[fid] = {...next, gap: Math.max(0, parseInt(mergedGap, 10) || 0)};
            });


            const presetFlag = (await storage.get('presetInitialized')) || 0;
            if (presetFlag === 0) {
                for (let i = 0; i < 1; i++) {
                    if (!Object.values(folders).some(f => f.name === hints[i].label)) {
                        const id = 'preset_' + hints[i].label;
                        folders[id] = {
                            name: hints[i].label,
                            chats: [],
                            collapsed: true,
                            prompts: Array.isArray(hints[i].text) ? hints[i].text : [hints[i].text]
                        };
                        storedOrder.push(id);
                    }
                }
                // 首次创建：同时写入初始化标记、folders 与排序
                await storage.set({
                    presetInitialized: 1,
                    folders,
                    folderOrder: storedOrder
                });
            } else {
                // 侧栏重新挂载时，确保本次内存里的 folders 与排序也同步持久化
                await storage.set({
                    folders,
                    folderOrder: storedOrder
                });
            }
            // 同步给后台脚本
            safeSendMessage({type: 'save-folders', data: folders});


            lastActiveMap = (await storage.get('lastActiveMap')) || {};
            let _migrated = false; // 标记旧版本数据迁移逻辑
            Object.values(folders).forEach(f => {
                if (!('prompts' in f)) {
                    f.prompts = typeof f.prompt === 'string' && f.prompt ? [f.prompt] : [];
                    delete f.prompt;
                    _migrated = true;
                }
            });
            if (_migrated) safeSendMessage({type: 'save-folders', data: folders});


            function detachLink(el) {
                if (!el || !el.dataset?.url) return;
                let path;
                try {
                    path = new URL(el.dataset.url, location.origin).pathname;
                } catch {
                }
                if (!path || !liveSyncMap.has(path)) return;
                const arr = liveSyncMap.get(path).filter(i => i.el !== el);
                arr.length ? liveSyncMap.set(path, arr) : liveSyncMap.delete(path);
            }

            // 根据会话路径移除对应 DOM 元素并清理映射
            function removeChatDom(path) {
                const arr = liveSyncMap.get(path);
                if (!arr) return;
                arr.forEach(({el}) => {
                    try {
                        detachLink(el);
                    } catch {
                    }
                    const li = el.closest('li');
                    if (li) li.remove();
                });
            }


            // Enhanced cleanup function for liveSyncMap - replace existing function
            function cleanupLiveSyncMap() {
                try {
                    if (liveSyncMap.size === 0) return false;
                    const aggressiveCleanup = liveSyncMap.size > 500;

                    // 收集当前在DOM中的路径
                    const activePaths = new Set();
                    try {
                        const anchors = qsa(HIST_ANCHOR);
                        for (let i = 0; i < anchors.length; i++) {
                            try {
                                activePaths.add(new URL(anchors[i].href, location.origin).pathname);
                            } catch {
                            }
                        }
                    } catch (e) {
                        console.warn('[Bookmark] Error collecting active paths:', e);
                    }

                    let cleaned = false;
                    let totalRemoved = 0;

                    for (const [path, arr] of liveSyncMap.entries()) {
                        if (!path) {
                            liveSyncMap.delete(path);
                            cleaned = true;
                            continue;
                        }

                        const pathInHistory = activePaths.has(path);

                        if (aggressiveCleanup && !pathInHistory) {
                            totalRemoved += Array.isArray(arr) ? arr.length : 0;
                            liveSyncMap.delete(path);
                            cleaned = true;
                            continue;
                        }

                        if (!Array.isArray(arr)) {
                            liveSyncMap.delete(path);
                            cleaned = true;
                            continue;
                        }

                        const beforeLength = arr.length;
                        const newArr = arr.filter(({el}) => el && el.isConnected);

                        if (newArr.length === 0) {
                            liveSyncMap.delete(path);
                            totalRemoved += beforeLength;
                            cleaned = true;
                        } else if (newArr.length !== arr.length) {
                            liveSyncMap.set(path, newArr);
                            totalRemoved += beforeLength - newArr.length;
                            cleaned = true;
                        }
                    }

                    if (cleaned && totalRemoved > 0) {
                        console.log(`[Bookmark] Cleaned ${totalRemoved} stale references from liveSyncMap`);
                    }

                    return cleaned;
                } catch (err) {
                    console.warn('[Bookmark] Error cleaning liveSyncMap:', err);
                    return false;
                }
            }

            function refreshHistoryOrder() {
                try {
                    const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');
                    if (!hist) return;

                    // 新增：按 pathname 去重，优先保留真实项（无 data-url），清理其余重复
                    const all = qsa('a[href*="/c/"]', hist);
                    const byPath = new Map();
                    for (const a of all) {
                        let p = null;
                        try {
                            p = new URL(a.href, location.origin).pathname;
                        } catch {
                        }
                        if (!p) continue;

                        const kept = byPath.get(p);
                        if (!kept) {
                            byPath.set(p, a);
                            continue;
                        }

                        const keptPlaceholder = kept.hasAttribute('data-url');
                        const curPlaceholder = a.hasAttribute('data-url');
                        const winner = keptPlaceholder && !curPlaceholder ? a : kept;       // 真实优先
                        const loser = winner === a ? kept : a;

                        const li = (loser.closest && loser.closest('li')) || loser;
                        try {
                            typeof detachLink === 'function' && detachLink(loser);
                        } catch {
                        }
                        if (li && li.parentElement) li.remove();

                        byPath.set(p, winner);
                    }

                    // 统一选中态，禁止改动原有顺序
                    const currPath = location.pathname;
                    const keptAnchors = [...byPath.values()];
                    const currAnchor = keptAnchors.find(a => samePath(a.href, currPath));
                    if (!currAnchor) return;

                    keptAnchors.forEach(a => a.removeAttribute('aria-current'));
                    currAnchor.setAttribute('aria-current', 'page');

                } catch (e) {
                    console.warn('[Bookmark] refreshHistoryOrder error:', e);
                }
            }


            function deepCleanMemory() {
                if (window.__deepCleanRunning) return;      // 防重入
                window.__deepCleanRunning = true;
                try {
                    console.log('[Bookmark] Running deep memory cleanup');

                    // Try cleaning liveSyncMap with error handling
                    try {
                        cleanupLiveSyncMap();
                    } catch (err) {
                        console.warn('[Bookmark] Error during liveSyncMap cleanup:', err);
                    }

                    // Clean observers with error handling
                    try {
                        observers.cleanup();
                    } catch (err) {
                        console.warn('[Bookmark] Error during observers cleanup:', err);
                    }

                    // Clean lastActiveMap with error handling
                    try {
                        const paths = [...liveSyncMap.keys()];
                        if (paths.length) {
                            let lastActiveMapChanged = false;
                            Object.keys(lastActiveMap).forEach(path => {
                                if (!paths.includes(path) && path !== '__history__') {
                                    delete lastActiveMap[path];
                                    lastActiveMapChanged = true;
                                }
                            });
                            if (lastActiveMapChanged) storage.set({lastActiveMap});
                        }

                    } catch (err) {
                        console.warn('[Bookmark] Error during lastActiveMap cleanup:', err);
                    }
                } catch (err) {
                    console.error('[Bookmark] Critical error in deepCleanMemory:', err);
                } finally {
                    window.__deepCleanRunning = false;
                }
            }

            // 每 5 分钟执行一次深度清理
            window.__deepCleanerId = setInterval(deepCleanMemory, 300000);

            // 页面离开时释放资源，防止泄漏
            window.addEventListener('beforeunload', () => {
                try {
                    observers.disconnectAll();
                } catch {
                }
                try {
                    window.__deepCleanerId && clearInterval(window.__deepCleanerId);
                } catch {
                }
            });


            // 统一版本 —— 自动选根节点，兼容旧/新版侧栏
            const syncTitles = () => {
                let updated = false;

                const histRoot =
                    qs('div#history') ||
                    qs('nav[aria-label="Chat history"]') ||
                    document;

                const anchorMap = new Map();
                qsa('a[href*="/c/"]', histRoot).forEach(link => {
                    const p = link.pathname;            // 直接取现成 pathname
                    if (p) anchorMap.set(p.split('?')[0], link);
                });


                liveSyncMap.forEach((arr, path) => {
                    const a = anchorMap.get(path);
                    if (!a) return;

                    const text = (a.textContent || 'New chat').trim();
                    arr.forEach(({fid, el}) => {
                        if (el.textContent !== text) el.textContent = text;
                        const folder = folders[fid];
                        if (!folder) return;
                        const chat = folder.chats.find(c => samePath(c.url, location.origin + path));
                        if (chat && chat.title !== text) {
                            chat.title = text;
                            updated = true;
                        }
                    });
                });

                if (updated) {
                    safeSendMessage({type: 'save-folders', data: folders});
                    highlightActive();
                }
            };

            const syncTitlesDebounced = debounce(syncTitles, 200);

            const syncObserver = observers.add(new MutationObserver(syncTitlesDebounced));
            [
                historyNode,
                qs('nav[aria-label="Chat history"]')
            ].filter(Boolean).forEach(node => {
                syncObserver.observe(node, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            });

            syncTitles();


            let prevHistoryPaths = new Set(qsa(HIST_ANCHOR).map(a => {
                try {
                    return new URL(a.href, location.origin).pathname;
                } catch {
                    return '';
                }
            }).filter(Boolean));
            let historyCleanupDebouncer = null;
            const historyCleanupObs = observers.add(new MutationObserver(() => {
                clearTimeout(historyCleanupDebouncer);
                historyCleanupDebouncer = setTimeout(() => {
                    try {
                        const histRoot = qs('div#history') || qs('nav[aria-label="Chat history"]');
                        const anchors = qsa('a[href*="/c/"]', histRoot);
                        const currentPaths = new Set(anchors.map(a => {
                            try {
                                return new URL(a.href, location.origin).pathname;
                            } catch {
                                return '';
                            }
                        }).filter(Boolean));

                        // 只依据“软删除”标记做分组同步，避免把未加载的老会话误判为删除
                        const softDeletedAnchors = qsa(
                            '[data-cgpt-soft-deleted="1"] a[href*="/c/"],' +
                            'a[href*="/c/"][data-cgpt-soft-deleted="1"],' +
                            'li[data-cgpt-soft-deleted="1"] a[href*="/c/"]',
                            histRoot || document
                        );
                        const softDeletedPaths = new Set(softDeletedAnchors.map(a => {
                            try {
                                return new URL(a.href, location.origin).pathname;
                            } catch {
                                return '';
                            }
                        }).filter(Boolean));

                        if (softDeletedPaths.size === 0) {
                            // 更新快照，避免重复计算；不改动分组
                            prevHistoryPaths = currentPaths;
                            return;
                        }

                        let changed = false;
                        const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(3)');
                        if (!folderZone) {
                            prevHistoryPaths = currentPaths;
                            return;
                        }

                        const fidList = Object.keys(folders);
                        for (const [fid, folder] of Object.entries(folders)) {
                            const oldChats = Array.isArray(folder.chats) ? folder.chats : [];
                            const newChats = oldChats.filter(c => {
                                try {
                                    const p = new URL(c.url, location.origin).pathname;
                                    // 仅当被标记软删除时从分组移除
                                    return !softDeletedPaths.has(p);
                                } catch {
                                    return true;
                                }
                            });
                            if (newChats.length !== oldChats.length) {
                                folder.chats = newChats;
                                changed = true;
                                const idx = fidList.indexOf(fid);
                                const oldBox = folderZone.children[idx];
                                if (oldBox) folderZone.replaceChild(renderFolder(fid, folder), oldBox);
                            }
                        }

                        if (changed) {
                            safeSendMessage({type: 'save-folders', data: folders});
                            highlightActive();
                        }
                        prevHistoryPaths = currentPaths;
                    } catch (err) {
                        console.warn('[Bookmark] History cleanup error:', err);
                    }
                }, 300);
            }));


            historyCleanupObs.observe(historyNode, {childList: true, subtree: true});

            // 辅助：赋予 <a> 拖拽能力
            function markDraggable(a) {
                if (a.dataset.drag) return;
                a.dataset.drag = "1";
                a.draggable = true;
                a.ondragstart = e => {
                    // 在交互控件上禁用拖拽，保留正常点击
                    if (e && e.target && e.target.closest('input, button, [data-trailing-button], .__menu-item-trailing-btn, [role="menu"], [role="menuitem"], [role="button"]')) {
                        e.preventDefault();
                        return false;
                    }
                    e.dataTransfer.setData('text/plain', a.href);
                };
            }


            // 在统一回调外部新增节流状态
            const unifiedObsCallback = (() => {
                let queue = [];        // 收集短时间内的所有 MutationRecord
                let scheduled = false; // 避免在同一帧内重复排队

                const process = batch => {                 // ↓以下内容保持原逻辑，只把参数换成 batch
                    let needProcess = false;
                    for (const m of batch) {
                        if (!m.addedNodes.length && !m.removedNodes.length) continue;
                        const nodes = [...m.addedNodes, ...m.removedNodes];
                        if (nodes.some(n => n.nodeType === 1 &&
                            (n.tagName === 'A' || n.querySelector?.('a')))) {
                            needProcess = true;
                            break;
                        }
                    }
                    if (!needProcess) return;

                    batch.forEach(m => {
                        m.addedNodes.forEach(n => {
                            if (n.nodeType !== 1) return;
                            if (n.matches?.('a[href*="/c/"]')) markDraggable(n);
                            n.querySelectorAll?.('a[href*="/c/"]').forEach(markDraggable);
                        });
                        m.removedNodes.forEach(n => {
                            if (n.nodeType !== 1) return;
                            if (n.matches?.('a[data-url]')) detachLink(n);
                            n.querySelectorAll?.('a[data-url]').forEach(detachLink);
                        });
                    });
                };

                return muts => {
                    queue.push(...muts);          // 合并本轮记录
                    if (scheduled) return;        // 已经排队就不再排
                    scheduled = true;
                    enqueueIdleTask(() => {       // 同帧仅一次真实处理
                        const batch = queue;
                        queue = [];
                        scheduled = false;
                        process(batch);
                    });
                };
            })();


            const unifiedObs = observers.add(new MutationObserver(unifiedObsCallback));
            // 优先使用 initBookmarks 传入的 historyNode，其次侧栏 nav，再退 body
            const unifiedRoot =
                historyNode ||
                qs('nav[aria-label="Chat history"]') ||
                qs('div#history') ||
                document.body;
            unifiedObs.observe(unifiedRoot, {childList: true, subtree: true});

            // ① 新增：让附件条显示可见的横向滚动条
            function enableAttachStripScroll() {
                const STYLE_ID = 'cgpt-attach-scroll-style';
                if (!document.getElementById(STYLE_ID)) {
                    const s = document.createElement('style');
                    s.id = STYLE_ID;
                    s.textContent = `
      form[data-type="unified-composer"] .cgpt-attach-strip{
        overflow-x:auto !important;
        -ms-overflow-style:auto;
        scrollbar-width:auto;
        scrollbar-gutter: stable both-edges;
        overscroll-behavior-inline: contain;
      }
      form[data-type="unified-composer"] .cgpt-attach-strip::-webkit-scrollbar{height:8px}
      form[data-type="unified-composer"] .cgpt-attach-strip::-webkit-scrollbar-thumb{background:rgba(255,255,255,.35);border-radius:8px}
      form[data-type="unified-composer"] .cgpt-attach-strip::-webkit-scrollbar-track{background:transparent}
    `;
                    document.head.appendChild(s);
                }
                // 选择并标记附件容器；去掉隐藏滚动条的类
                const strip = document.querySelector('form[data-type="unified-composer"] .horizontal-scroll-fade-mask');
                if (strip && !strip.classList.contains('cgpt-attach-strip')) {
                    strip.classList.remove('no-scrollbar');
                    strip.classList.add('cgpt-attach-strip');
                }
            }

            enableAttachStripScroll();
            const attachObs = observers.add(new MutationObserver(() => enableAttachStripScroll()));
            attachObs.observe(document.body, {childList: true, subtree: true});


            /* ---------- 渲染 ---------- */

            function render() {
                // 清理失连映射（保持原逻辑）
                for (const [path, arr] of liveSyncMap) {
                    const live = arr.filter(item => item.el.isConnected);
                    live.length ? liveSyncMap.set(path, live) : liveSyncMap.delete(path);
                }

                const entries = Object.entries(folders);       // 需要渲染的分组
                folderZone.replaceChildren();
                let i = 0;
                const chunk = () => {
                    const frag = document.createDocumentFragment();          // 批量写入
                    const start = performance.now();                          // 精度更高
                    while (i < entries.length && performance.now() - start < CHUNK_BUDGET_MS) {
                        const [id, f] = entries[i++];
                        frag.appendChild(renderFolder(id, f));               // 收集到片段
                    }
                    folderZone.appendChild(frag);                            // 一次性更新 DOM
                    if (i < entries.length) {
                        enqueueIdleTask(chunk);
                    } else {
                        highlightActive();
                        if (Math.random() < 0.2) enqueueIdleTask(cleanupLiveSyncMap);
                        enqueueIdleTask(() => syncTitles());   // 新增：渲染完立即同步一次标题
                    }
                };
                enqueueIdleTask(chunk);
            }


            /* ---------- 文件夹渲染 ---------- */
            function renderFolder(fid, f) {
                function renderChatsLocal() {
                    ul.replaceChildren();
                    if (f.collapsed) {
                        ul.style.display = 'none';
                        return;
                    }

                    const MAX_VISIBLE = 10;
                    const chatsForRender = [...f.chats].sort((a, b) =>
                        (a.pinned === b.pinned) ? 0 : (a.pinned ? -1 : 1)
                    );
                    const showAll = !!f.__showAll;
                    const visibleList = showAll ? chatsForRender : chatsForRender.slice(0, MAX_VISIBLE);

                    let ci = 0;
                    const chatChunk = () => {
                        const start = performance.now();
                        while (ci < visibleList.length && performance.now() - start < CHUNK_BUDGET_MS) {
                            renderChat(ul, fid, visibleList[ci++]);
                        }
                        if (ci < visibleList.length) enqueueIdleTask(chatChunk);
                    };

                    enqueueIdleTask(chatChunk);

                    if (chatsForRender.length > MAX_VISIBLE) {
                        const toggleLi = document.createElement('li');
                        toggleLi.textContent = showAll
                            ? '▲ close all'
                            : `▼ more (${chatsForRender.length - MAX_VISIBLE})`;
                        toggleLi.style.cssText =
                            'cursor:pointer;font-size:12px;color:#888;margin:2px 0;padding:2px 4px;text-align:center';
                        toggleLi.onclick = e => {
                            e.stopPropagation();
                            f.__showAll = !showAll;
                            renderChatsLocal();
                        };
                        ul.appendChild(toggleLi);
                    }

                    ul.style.display = '';
                }

                // 新增一行：容错，保证后续所有地方都能安全访问 f.chats.length
                if (!Array.isArray(f?.chats)) f.chats = [];
                const box = document.createElement('div');
                box.style.marginTop = '4px';
                const header = document.createElement('div');
                header.style.cssText = `position:relative;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;padding:1.5px 6px;background:${COLOR.bgLight};border-radius:10px`;
                const corner = document.createElement('div');
                corner.className = 'cgpt-folder-corner';
                corner.dataset.fid = fid;
                corner.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;border-top:12px solid transparent;border-right:12px solid transparent';
                if (fid === activeFid) corner.style.borderTopColor = '#fff';
                header.append(corner);


                const arrow = document.createElement('span');
                arrow.textContent = f.collapsed ? '∴' : '∵';
                const lbl = document.createElement('span');
                lbl.textContent = f.name;
                lbl.style.cssText = 'flex:1;white-space:normal;word-break:break-all;line-height:1.25';
                const left = document.createElement('div');
                left.style.cssText = 'display:flex;gap:6px;flex:1;align-items:flex-start';
                left.append(arrow, lbl);

                const newBtn = Object.assign(document.createElement('button'), {
                    type: 'button',
                    // 唯一 ID，用于区别组内 New chat 按钮
                    id: `cgpt-group-new-chat-${fid}`,
                });
                newBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;color:#e7d8c5;cursor:pointer;transition:background .15s'; // 基础外观同前
                newBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' + // 引入图一完整 SVG
                    '<path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287Z"></path>' + '<path d="M18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708Z"></path>' + '<path d="M11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"></path>' + '</svg>';
                let hideTip;                                                             // 保存提示关闭函数
                newBtn.onmouseenter = () => {                                            // 鼠标进入时
                    hideTip = tip(newBtn, 'New chat');                                   // 显示提示
                    newBtn.style.background = 'rgba(255,255,255,.07)';
                };
                newBtn.onmouseleave = () => {                                            // 鼠标离开时
                    hideTip && hideTip();                                                // 关闭提示
                    newBtn.style.background = '';                                        // 去掉深色背景
                };
                newBtn.onmousedown = () => newBtn.style.background = 'rgba(255,255,255,.07)'; // 按下保持深色
                newBtn.onmouseup = () => {                                               // 松开时若仍在按钮上维持悬停态
                    if (newBtn.matches(':hover')) return;                                // 仍在悬停则不恢复
                    newBtn.style.background = '';                                        // 否则清空背景
                };

                // ===== 替换后代码（三点菜单及弹框）=====
                const menuBtn = Object.assign(document.createElement('span'), {          // 创建三点菜单按钮
                    textContent: '⋯',                                                    // 使用省略号
                    style: 'color:white;cursor:pointer;margin-left:6px;font-size:18px;line-height:1' // 样式
                });
                header.append(left, newBtn, menuBtn);
                menuBtn.addEventListener('click', e => {
                    e.stopPropagation();                              // 不触发折叠
                    document.getElementById('cgpt-folder-menu')?.remove();   // 单实例
                    const rect = menuBtn.getBoundingClientRect();

                    const menu = Object.assign(document.createElement('div'), {
                        id: 'cgpt-folder-menu'
                    });
                    menu.style.cssText = `
        position:fixed;z-index:2147483647;
        min-width:140px;padding:8px 0;border-radius:10px;
        background:#2b2521;color:#e7d8c5;
        box-shadow:0 4px 10px rgba(0,0,0,.2);font-size:14px`;
                    const curPath = location.pathname;
                    const curChat = f.chats.find(c => samePath(c.url, location.origin + curPath));
                    const pinState = curChat ? (curChat.pinned ? 'unpin' : 'pin') : null;

                    let html = `
        <div class="f-item" data-act="prompt" style="padding:6px 16px;cursor:pointer">Prompt</div>
        <div class="f-item" data-act="rename" style="padding:6px 16px;cursor:pointer">Rename</div>`;
                    if (pinState) {
                        html += `<div class="f-item" data-act="${pinState}" style="padding:6px 16px;cursor:pointer">
                 ${pinState === 'pin' ? 'pin' : 'unpin'}
             </div>`;
                    }
                    html += `<div class="f-item" data-act="delete" style="padding:6px 16px;cursor:pointer;color:#e66">Delete</div>`;
                    menu.innerHTML = html;

                    document.body.appendChild(menu);
                    menu.style.left = rect.right - menu.offsetWidth + 'px';
                    menu.style.top = rect.bottom + 6 + 'px';

                    const close = () => menu.remove();
                    setTimeout(() => document.addEventListener('click', close, {once: true}), 0);

                    menu.addEventListener('click', async ev => {
                        ev.stopPropagation();
                        const act = ev.target.dataset.act;
                        if (!act) return;

                        if (act === 'rename') {                       // 重命名
                            const n = prompt('rename group', folders[fid].name);
                            if (n && n.trim()) {
                                folders[fid].name = n.trim().slice(0, 20) + (n.trim().length > 20 ? '…' : '');
                                safeSendMessage({type: 'save-folders', data: folders});
                                render();
                            }
                            close();
                        }

                        if (act === 'delete') {                       // 删除
                            if (confirm('sure delete this group?')) {
                                delete folders[fid];
                                safeSendMessage({type: 'save-folders', data: folders});
                                render();
                            }
                            close();
                        }

                        if (act === 'prompt') {                       // 设置 prompt
                            const modal = document.createElement('div');
                            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483648';

                            const box = document.createElement('div');
                            // ① 增加 position:relative 便于在盒子内绝对定位按钮
                            box.style.cssText = 'background:#2b2521;padding:16px;border-radius:6px;max-width:400px;width:80%;position:relative';

                            /* ② 新增圆形问号帮助按钮 */
                            const helpBtn = document.createElement('button');
                            helpBtn.textContent = '?';
                            helpBtn.style.cssText = [
                                'width:24px', 'height:24px', 'border-radius:50%',
                                'border:none', 'background:#444', 'color:#e7d8c5',
                                'font-weight:bold', 'cursor:pointer', 'line-height:24px',
                                'margin-left:6px'            // 与输入框保持 6 px 间距
                            ].join(';');

                            /* ③ 点击帮助按钮弹出操作说明 */
                            helpBtn.onclick = () => {
                                if (document.getElementById('cgpt-help-box')) return;        // 单实例
                                const overlay = document.createElement('div');
                                overlay.id = 'cgpt-help-box';
                                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:2147483649';

                                const info = document.createElement('div');
                                info.style.cssText = 'background:#2b2521;color:#e7d8c5;padding:16px;border-radius:6px;max-width:320px;width:80%';

                                /* 标题 */
                                const title = document.createElement('p');
                                title.textContent = 'Instruction';
                                title.style.cssText = 'font-weight:700;margin-bottom:8px';
                                info.appendChild(title);

                                /* 只读文本框，放置全部说明文字 */
                                const txt = [
                                    `1. The prompt setting interface allows you to add up to ${MAX_PROMPTS} prompts for each group, each of which can be entered or deleted;\n` +
                                    '2. Click "+" to add a new prompt, and "-" to delete an existing prompt;\n' +
                                    '3. Click the preset label at the bottom (such as: NO_GUESS, change_code) to insert the corresponding content into the cursor position of the currently selected input box;\n' +
                                    '4. The "how often does this happen?" input box is used to set the number of rounds between prompts. Fill in an integer, and the default value of 0 will be inserted every round;\n' +
                                    '5. Click "ok" to save all changes, and click "cancel" to cancel;'
                                ].join('\\n');

                                const ta = document.createElement('textarea');
                                ta.value = txt;
                                ta.readOnly = true;
                                ta.style.cssText = [
                                    'width:100%', 'height:300px',
                                    'background:#1e1815', 'color:#e7d8c5',
                                    'border:none', 'padding:8px',
                                    'border-radius:6px', 'resize:none',
                                    'line-height:1.4'
                                ].join(';');
                                info.appendChild(ta);

                                /* 关闭按钮 */
                                const close = document.createElement('button');
                                close.textContent = 'close';
                                close.style.cssText = 'margin-top:12px';
                                close.onclick = () => overlay.remove();

                                info.appendChild(close);
                                overlay.appendChild(info);
                                document.body.appendChild(overlay);
                            };

                            const promptWrap = document.createElement('div');
                            promptWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
                            let activeTa;
                            const addTa = (val = '') => {
                                // 行容器：让 textarea 靠左，右留空位放删除键
                                const row = document.createElement('div');
                                row.style.cssText = 'display:flex;align-items:flex-start;gap:6px';

                                // textarea 本身：宽度改为自动拉伸，占行内剩余空间
                                const t = document.createElement('textarea');
                                t.value = val;
                                t.style.cssText = 'flex:1;height:80px;background:#1e1815;color:#e7d8c5;border:none;padding:8px;border-radius:6px;resize:vertical';
                                t.onfocus = () => {
                                    activeTa = t;
                                };

                                // 删除按钮
                                const del = document.createElement('button');
                                del.textContent = '-';
                                del.style.cssText = 'width:24px;height:24px;flex:0 0 24px;border:none;border-radius:6px;background:#444;color:#e7d8c5;cursor:pointer';
                                del.onclick = () => {
                                    row.remove();
                                };

                                row.append(t, del);
                                promptWrap.appendChild(row);
                                activeTa = t;
                            };

                            const exist = folders[fid].prompts && Array.isArray(folders[fid].prompts)
                                ? folders[fid].prompts
                                : (folders[fid].prompt ? [folders[fid].prompt] : []);
                            (exist.length ? exist : ['']).slice(0, MAX_PROMPTS).forEach(v => addTa(v));

                            const addBtn = document.createElement('button');
                            addBtn.textContent = '+';
                            addBtn.style.cssText = 'width:24px;height:24px;flex:0 0 24px;border:none;border-radius:6px;background:#444;color:#e7d8c5;cursor:pointer';
                            addBtn.onclick = () => {
                                if (promptWrap.children.length < MAX_PROMPTS) addTa('');
                            };

                            // ① 预设提示词
                            const hintBar = document.createElement('div');
                            hintBar.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap';
                            hints
                                .filter(h => h.label !== 'NORMAL')          // 仅当前分组的提示词
                                .forEach(h => {
                                    const btn = document.createElement('span');
                                    btn.textContent = h.label;
                                    btn.style.cssText = 'cursor:pointer;padding:2px 4px;border:1px solid #555;border-radius:12px;font-size:12px;position:relative;top:-2px';
                                    btn.onclick = () => {
                                        if (!activeTa) return;
                                        activeTa.focus();
                                        const {selectionStart: s, selectionEnd: e} = activeTa;
                                        activeTa.setRangeText(h.text, s, e, 'end');
                                        activeTa.dispatchEvent(new Event('input', {bubbles: true}));
                                    };
                                    hintBar.appendChild(btn);
                                });

                            const ok = document.createElement('button');
                            ok.textContent = 'ok';
                            ok.style.cssText = 'margin-right:8px';
                            const cancel = document.createElement('button');
                            cancel.textContent = 'cancel';
                            const wrap = document.createElement('div');
                            wrap.style.cssText = 'text-align:right;margin-top:10px';
                            wrap.append(ok, cancel);

                            /* 新增：间隔轮数输入框 —— 仅正整数，默认 0 */
                            const gapWrap = document.createElement('div');
                            gapWrap.style.cssText = 'margin-top:8px;font-size:12px;display:flex;align-items:center;gap:6px';
                            gapWrap.innerHTML = '<span>How often does this happen?</span>';
                            const gapInput = Object.assign(document.createElement('input'), {
                                type: 'number',
                                min: 0,
                                step: 1,
                                value: folders[fid].gap ?? 0,
                                style: 'flex:0 0 ;width:155px; height:24px;border-radius:4px;border:1px solid #555;background:#1e1815;color:#e7d8c5;padding:0 6px'
                            });
                            gapWrap.appendChild(gapInput);
                            gapWrap.appendChild(helpBtn);

                            box.append(promptWrap, addBtn, hintBar, gapWrap, wrap);
                            modal.appendChild(box);
                            document.body.appendChild(modal);

                            ok.onclick = async () => {
                                folders[fid].prompts = Array.from(promptWrap.querySelectorAll('textarea'))
                                    .map(t => {
                                        const v = t.value.trim();
                                        return (v.startsWith('※') && v.endsWith('※')) ? v : `※${v}※`;
                                    })
                                    .filter(Boolean)
                                    .slice(0, MAX_PROMPTS);
                                const newGap = Math.max(0, parseInt(gapInput.value) || 0);
                                folders[fid].gap = newGap;
                                if (chrome?.runtime?.id) {
                                    const gaps = (await storage.get('folderGaps')) || {};
                                    gaps[fid] = newGap;
                                    await storage.set({folders, folderGaps: gaps});
                                }
                                safeSendMessage({type: 'save-folders', data: folders});
                                render();
                                document.body.removeChild(modal);
                            };


                            cancel.onclick = () => document.body.removeChild(modal);
                            close();
                        }

                        if (act === 'pin' || act === 'unpin') {
                            const pIdx = f.chats.findIndex(c => samePath(c.url, location.origin + location.pathname));
                            if (pIdx > -1) {
                                const chat = f.chats[pIdx];
                                chat.pinned = (act === 'pin');

                                // 重新排位：所有 pinned 在最前，其余保持原顺序
                                f.chats.splice(pIdx, 1);
                                const firstUnPinned = f.chats.findIndex(c => !c.pinned);
                                const insertAt = chat.pinned ? 0 : (firstUnPinned === -1 ? f.chats.length : firstUnPinned);
                                f.chats.splice(insertAt, 0, chat);

                                safeSendMessage({type: 'save-folders', data: folders});
                                render();
                                highlightActive();
                            }
                            close();
                        }

                    });
                });

                newBtn.onclick = e => {
                    e.stopPropagation();
                    clearActiveOnHistoryClick = false;

                    if (currentNewChatObserver) {
                        try {
                            currentNewChatObserver.disconnect();
                        } catch {
                        }
                        currentNewChatObserver = null;
                    }
                    if (currentNewChatPopHandler) {
                        window.removeEventListener('popstate', currentNewChatPopHandler);
                        currentNewChatPopHandler = null;
                    }

                    const clickedFid = fid;
                    activeFid = clickedFid;
                    window.__cgptPendingFid = clickedFid;
                    const token = Date.now().toString(36);
                    window.__cgptPendingToken = token;
                    delete window.__cgptPromptGapCounters['/'];
                    delete window.__cgptPromptIndexMap['/'];

                    // 保底：把根路径映射到当前分组，侧栏自动收起再展开仍能保持高亮
                    lastActiveMap['/'] = clickedFid;
                    if (chrome?.runtime?.id) chrome.storage.sync.set({lastActiveMap});

                    /* ==== 新增：窄屏兜底监听 ==== */
                    const initPath = location.pathname;
                    const popHandler = () => {
                        try {
                            // newBtn.onclick → popHandler 内
                            if (token === window.__cgptPendingToken &&
                                location.pathname !== initPath &&
                                location.pathname.startsWith('/c/')) {
                                // 只移除自身的 popstate 监听，保留历史观察器等待真正的 <a> 节点出现
                                window.removeEventListener('popstate', popHandler);
                                currentNewChatPopHandler = null;

                                const p = location.pathname;
                                lastActiveMap[p] = clickedFid;
                                if (chrome?.runtime?.id) chrome.storage.sync.set({lastActiveMap});
                                activeFid = clickedFid;
                                render();
                                highlightActive();

                                window.__cgptPendingNewChatPath = p;
                                try {
                                    scheduleHistoryRefresh?.(p);
                                } catch {
                                }
                                try {
                                    __cgptEnsureHistoryRowFor?.(p);
                                } catch {
                                }
                            }

                        } catch (err) {
                            console.warn('[Bookmark] Fallback popstate handler error:', err);
                        }
                    };
                    window.addEventListener('popstate', popHandler, {once: false});
                    currentNewChatPopHandler = popHandler;
                    /* ==== 兜底结束 ==== */

                    const prevPaths = new Set(
                        qsa(HIST_ANCHOR).map(a => new URL(a.href).pathname)
                    );
                    const globalNewBtn = qs('button[aria-label="New chat"]');

                    if (globalNewBtn) {
                        // ↓ 避免全局按钮把刚设好的组高亮清掉
                        window.__cgptSuppressGroupClear = true;
                        globalNewBtn.click();
                    } else {
                        history.pushState({}, '', '/');
                        window.dispatchEvent(new Event('popstate'));
                    }
                    highlightActive();


                    // 定义observer - 监视history区域变化以检测新聊天
                    const observer = new MutationObserver(() => {
                        if (token !== window.__cgptPendingToken) return;
                        const anchors = qsa(HIST_ANCHOR);

                        const currentPaths = new Set(
                            anchors.map(a => {
                                try {
                                    return new URL(a.href, location.origin).pathname;
                                } catch {
                                    return '';
                                }
                            }).filter(Boolean)
                        );

                        // 仅保留本次真正新增的路径
                        let newPaths = [...currentPaths].filter(p => !prevPaths.has(p));

                        if (!newPaths.length && anchors[0]) {
                            try {
                                const topPath = new URL(anchors[0].href, location.origin).pathname;
                                if (!prevPaths.has(topPath)) newPaths = [topPath];
                            } catch {
                            }
                        }

                        if (!newPaths.length) return;


                        observer.disconnect();
                        currentNewChatObserver = null;
                        window.removeEventListener('popstate', popHandler); // 防止兜底重复触发


                        /* 1. 依据侧栏顺序挑选最上面的新增会话 */
                        let newChatAnchor = anchors.find(a => {
                            try {
                                const p = new URL(a.href, location.origin).pathname;
                                return newPaths.includes(p);
                            } catch {
                                return false;
                            }
                        });

                        /* 2. 若仍有歧义，排除已在该分组中的路径 */
                        if (!newChatAnchor) {
                            newChatAnchor = anchors.find(a => {
                                try {
                                    const p = new URL(a.href, location.origin).pathname;
                                    return newPaths.includes(p) &&
                                        !folders[clickedFid]?.chats.some(c => samePath(c.url, a.href));
                                } catch {
                                    return false;
                                }
                            });
                        }

                        /* 3. 兜底方案 */
                        const newChatUrl = newChatAnchor ? newChatAnchor.href
                            : (location.origin + newPaths[0]);
                        const title = (newChatAnchor?.textContent || 'New chat').trim();

                        try {
                            const path = new URL(newChatUrl).pathname;
                            lastActiveMap[path] = clickedFid;
                            if (chrome?.runtime?.id) {
                                chrome.storage.sync.set({lastActiveMap});
                            }

                            // 把新会话写入分组；若已存在则上移到最前
                            const folder = folders[clickedFid];
                            if (folder) {
                                const i = folder.chats.findIndex(c => samePath(c.url, newChatUrl));
                                if (i >= 0) {
                                    const [chat] = folder.chats.splice(i, 1);
                                    folder.chats.unshift(chat);
                                } else {
                                    folder.chats.unshift({url: newChatUrl, title});
                                }
                                safeSendMessage({type: 'save-folders', data: folders});
                                render();               // 重新渲染以建立 liveSyncMap
                            }

                            highlightActive();
                            setTimeout(() => {                     // 保证第一次编辑区就有 prompt
                                try {
                                    if (typeof appendSuffix === 'function') appendSuffix();
                                } catch (e) {
                                    console.warn('[Bookmark] appendSuffix error:', e);
                                }
                            }, 0);
                        } catch (err) {
                            console.warn('[Bookmark] Error processing new chat metadata:', err);
                        }

                    });

                    observer.observe(qs('div#history') || qs('nav[aria-label="Chat history"]'), {
                        childList: true,
                        subtree: true
                    });
                    currentNewChatObserver = observer;
                };
                const ul = document.createElement('ul');
                ul.style.cssText = `list-style:none;padding-left:8px;margin:4px 0 0;${f.collapsed ? 'display:none' : ''}`;

                if (!f.collapsed && f.chats.length) {
                    const MAX_VISIBLE = 10;                                       // 超出条数触发折叠
                    const chatsForRender = [...f.chats].sort((a, b) =>
                        (a.pinned === b.pinned) ? 0 : (a.pinned ? -1 : 1)
                    );

                    // “显示全部” 状态保存在内存字段 __showAll，默认折叠
                    const showAll = !!f.__showAll;
                    const visibleList = showAll ? chatsForRender
                        : chatsForRender.slice(0, MAX_VISIBLE);

                    // 分帧渲染可见列表
                    let ci = 0;
                    const chatChunk = () => {
                        const start = Date.now();
                        while (ci < visibleList.length && Date.now() - start < CHUNK_BUDGET_MS) {
                            renderChat(ul, fid, visibleList[ci++]);
                        }
                        if (ci < visibleList.length) enqueueIdleTask(chatChunk);
                    };
                    enqueueIdleTask(chatChunk);

                    // 如果超出阈值，添加“显示更多 / 收起” 控制项
                    if (chatsForRender.length > MAX_VISIBLE) {
                        const toggleLi = document.createElement('li');
                        toggleLi.textContent = showAll
                            ? '▲ close all'
                            : `▼ more (${chatsForRender.length - MAX_VISIBLE})`;
                        toggleLi.style.cssText =
                            'cursor:pointer;font-size:12px;color:#888;margin:2px 0;padding:2px 4px;text-align:center';
                        toggleLi.onclick = e => {
                            e.stopPropagation();
                            f.__showAll = !showAll;
                            render();
                        };
                        ul.appendChild(toggleLi);
                    }
                }


                header.onclick = () => {
                    f.collapsed = !f.collapsed;
                    scheduleSaveFolders();
                    arrow.textContent = f.collapsed ? '∴' : '∵';

                    if (!f.collapsed) {
                        // 关键修复：每次从收缩→展开都重绘，确保列表与计数刷新
                        renderChatsLocal();
                    } else {
                        ul.style.display = 'none';
                    }

                    if (typeof highlightActive === 'function') highlightActive();
                };


                // —— 修改后代码片段 ——
                box.ondragover = e => {
                    e.preventDefault();
                    header.style.background = COLOR.bgHover;
                };
                box.ondragleave = e => {
                    e.preventDefault();
                    header.style.background = COLOR.bgLight;
                };
                box.ondrop = async e => {
                    e.preventDefault();
                    header.style.background = COLOR.bgLight;
                    const url = e.dataTransfer.getData('text/plain');
                    if (!url || f.chats.some(c => samePath(c.url, url))) return;
                    const t = qsa('a[href*="/c/"]').find(a => samePath(a.href, url))?.textContent.trim() || 'chat';
                    f.chats.unshift({url, title: t}); // 插入到数组开头
                    safeSendMessage({type: 'save-folders', data: folders});
                    const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(3)');
                    const fidList = Object.keys(folders);
                    const idx = fidList.indexOf(fid);
                    const oldBox = folderZone.children[idx];
                    const newBox = renderFolder(fid, folders[fid]);
                    folderZone.replaceChild(newBox, oldBox);
                    highlightActive()
                };

                // 先收集当前所有分组的 id 顺序
                const keys = Object.keys(folders);
                const idx = keys.indexOf(fid);
                // 把拖拽事件绑到 header 上
                header.dataset.idx = String(idx);
                header.draggable = true;
                header.ondragstart = e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('folder', String(idx));
                };
                header.ondragover = e => {
                    e.preventDefault();
                    header.style.background = COLOR.bgHover;
                };
                header.ondragleave = () => {
                    header.style.background = COLOR.bgLight;
                };
                header.ondrop = e => {
                    e.preventDefault();
                    header.style.background = COLOR.bgLight;
                    const fromData = e.dataTransfer.getData('folder');
                    if (!fromData) return;    // 只有 folder 拖拽才处理
                    const from = parseInt(fromData, 10);
                    const to = parseInt(header.dataset.idx, 10);
                    if (from === to) return;
                    // 重新排序 keys
                    const moved = keys.splice(from, 1)[0];
                    keys.splice(to, 0, moved);
                    // 重建 folders 并持久化
                    const newFolders = {};
                    keys.forEach(id => newFolders[id] = folders[id]);
                    folders = newFolders;
                    storage.set({folders, folderOrder: keys});
                    render();
                };


                box.append(header, ul);
                return box;

            }

            /* ---------- 聊天渲染 ---------- */
            function renderChat(parentUl, fid, chat) {
                const li = document.createElement('li');
                li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:2px 0';

                if (chat.pinned) {
                    const pin = document.createElement('span');
                    pin.textContent = '📌';
                    pin.style.cssText = 'margin-right:4px;font-size:12px;line-height:1';
                    li.appendChild(pin);
                }

                const link = document.createElement('a');
                // 创建超链接节点
                link.href = chat.url || 'javascript:void 0';
                link.textContent = chat.title;
                link.dataset.url = chat.url || '';
                link.style.cssText = 'flex:1;min-width:0;margin-right:4px;font-size:13px;color:#b2b2b2;text-decoration:none;border-radius:6px;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.25';
                const active = chat.url && samePath(chat.url, location.href);
                if (active) {
                    link.style.background = 'rgba(255,255,255,.07)';
                    link.style.color = '#fff';
                }
                link.onclick = e => {
                    window.__cgptPendingFid = null;
                    window.__cgptPendingToken = null;
                    clearActiveOnHistoryClick = false;
                    if (!chat.url) return;
                    e.preventDefault();

                    // 新增：一次性保护，防止紧随其后的 history 监听把映射写成 "__history__"
                    window.__cgptIgnoreNextHistoryClick = true;
                    setTimeout(() => {
                        try {
                            delete window.__cgptIgnoreNextHistoryClick;
                        } catch {
                        }
                    }, 500);

                    const stillExists = qsa(HIST_ANCHOR).some(a => samePath(a.href, chat.url));
                    if (!stillExists) {
                        try {
                            window.scheduleHistoryRefresh?.(chat.url);
                        } catch {
                        }
                        try {
                            window.__cgptEnsureHistoryRowFor?.(chat.url);
                        } catch {
                        }
                        // 不中断，继续导航
                    }

                    lastClickedChatEl = link;
                    const path = new URL(chat.url, location.origin).pathname;
                    lastActiveMap[path] = fid;
                    try {
                        if (chrome?.runtime?.id) storage.set({lastActiveMap});
                    } catch (err) {
                        console.warn('[Bookmark] Error saving lastActiveMap:', err);
                    }
                    history.pushState({}, '', chat.url);
                    window.dispatchEvent(new Event('popstate'));
                    highlightActive();
                    setTimeout(() => {
                        if (lastClickedChatEl === link) lastClickedChatEl = null;
                    }, 100);
                };


                const del = document.createElement('span');
                del.textContent = '✕';
                del.style.cssText = 'cursor:pointer;color:white;position:relative;left:-6px';
                del.dataset.url = chat.url;
                del.dataset.fid = fid;
                del.onclick = e => {
                    e.stopPropagation();
                    // 从对应分组中删除这条聊天
                    const arr = folders[fid].chats;
                    const index = arr.findIndex(c => samePath(c.url, chat.url));
                    if (index !== -1) {
                        arr.splice(index, 1);

                        try {
                            const p = new URL(chat.url, location.origin).pathname;
                            if (lastActiveMap[p]) {
                                delete lastActiveMap[p];
                                if (chrome?.runtime?.id) storage.set({lastActiveMap});
                            }
                        } catch {
                        }

                        safeSendMessage({type: 'save-folders', data: folders});
                        detachLink(link);
                        li.remove();
                        highlightActive();
                    }
                };
                li.append(link, del);


                parentUl.appendChild(li);


                if (chat.url) {
                    let path;
                    try {
                        path = new URL(chat.url, location.origin).pathname;
                    } catch {
                        path = null;
                    }
                    if (path) {
                        if (!liveSyncMap.has(path)) liveSyncMap.set(path, []);
                        const arr = liveSyncMap.get(path);
                        if (!arr.some(item => item.el === link))
                            arr.push({fid, el: link});
                    }
                }
            }


            /* ---------- 移除压缩按钮 ---------- */
            observers.add(new MutationObserver(() => qsa('path[d^="M316.9 18"]').forEach(p => p.closest('button')?.remove())))
                .observe(document.body, {childList: true, subtree: true});

            /* ---------- 输入尾部提示 ---------- */
            function appendSuffix() {
                // 若是从 history 面板点击进入，只跳过“尾部提示（SUFFIX）”，但仍允许插入 prompt
                let skipSuffixOnce = false;
                if (clearActiveOnHistoryClick) {
                    clearActiveOnHistoryClick = false;
                    skipSuffixOnce = true;
                }
                if (isUploading()) return;
                const ed = qs('.ProseMirror');
                if (!ed) return;
                const SUFFIX = '';
                let changed = false;

                const path = location.pathname;                                         // 当前会话路径
                const mapArr = liveSyncMap.get(path) || [];                             // 映射数组（可能为空）
                mapArr.filter(({el}) => document.contains(el));

                const storedFid = lastActiveMap[path];

                /* ① 最高优先：仍处于“New chat → 首条消息”流程时，用挂起分组 */
                let currentFid = (window.__cgptPendingFid && folders[window.__cgptPendingFid])
                    ? window.__cgptPendingFid
                    : null;

                /* ② 其次：已建立的路径→分组映射 */
                if (!currentFid && storedFid && storedFid !== '__history__' && folders[storedFid]) {
                    currentFid = storedFid;
                }

                /* ③ 再次：上一次有效的 activeFid */
                if (!currentFid) currentFid = activeFid; // ② 再看临时/旧值

                // 若该会话明确来自 History 视图，则不做兜底扫描
                const clickedFromHistory = storedFid === '__history__';

                if (!currentFid && !clickedFromHistory) {                          // ③ 最后全表扫描
                    for (const [fid, folder] of Object.entries(folders)) {
                        if (folder.chats.some(c => samePath(c.url, location.origin + path))) {
                            currentFid = fid;
                            break;
                        }
                    }
                }


                if (currentFid && currentFid !== activeFid) activeFid = currentFid;

                if (!currentFid && !clickedFromHistory) {                          // ③ 最后扫描各分组
                    for (const [fid, folder] of Object.entries(folders)) {
                        if (folder.chats.some(c => samePath(c.url, location.origin + path))) {
                            currentFid = fid;
                            activeFid = fid;
                            break;
                        }
                    }
                }

                /* 新增：仅当“角标”可见或处于挂起建联态时才允许注入组 prompt */
                const allowByPending = !!(window.__cgptPendingFid && folders[window.__cgptPendingFid]);
                let allowByTriangle = false;
                if (activeFid) {
                    const cornerEl = document.querySelector(`.cgpt-folder-corner[data-fid="${activeFid}"]`);
                    const color = cornerEl?.style?.borderTopColor || '';
                    allowByTriangle = !!cornerEl && color && color !== 'transparent';
                }
                if (!allowByPending && !allowByTriangle) {
                    currentFid = null;   // 阻断后续 prompt 注入
                }

                // 会话级 prompt 与组内 prompt 不再区分优先级；单独计算两者
                const sessionPrompt = (() => {
                    try {
                        const raw = sessionStorage.getItem('cgptSessionPrompt');
                        const obj = raw ? JSON.parse(raw) : null;
                        return (obj && String(obj.text || '').trim()) || '';
                    } catch {
                        return '';
                    }
                })();

                const groupPrompts = currentFid ? (folders[currentFid].prompts || []) : [];

                const indices = window.__cgptPromptIndexMap;
                const counterKey = (path === '/' && window.__cgptPendingToken) ? `/${window.__cgptPendingToken}` : path;
                const idx = indices[counterKey] || 0;

                const groupPrompt = groupPrompts.length
                    ? (groupPrompts[idx % groupPrompts.length] || '').trim()
                    : '';

                const inputPrompt = sessionPrompt;                   // 输入框设置的 prompt（可能为空）
                const mainPrompt = groupPrompt || inputPrompt;       // 至少保证注入其一

                // 会话级 prompt 默认每轮都注入；否则沿用分组的间隔设置（默认 3）
                const gap = sessionPrompt
                    ? 0
                    : (currentFid && Number.isFinite(folders[currentFid].gap)
                        ? Math.max(0, folders[currentFid].gap)
                        : 3);


                const gapCounters = window.__cgptPromptGapCounters;
                let cnt = gapCounters[counterKey];

                let injectNow = false;

                if (cnt === undefined) { // 第一次，强制追加，并将cnt设为1
                    injectNow = true;
                    cnt = 1;
                } else if (gap < 1) {
                    injectNow = true;
                    cnt = 0;
                } else if (cnt > gap) {          // 满足间隔
                    injectNow = true;
                    cnt = 1;                          // 重置计数
                } else {
                    cnt += 1;                         // 未到间隔，仅累加
                }
                gapCounters[counterKey] = cnt;

                if (injectNow && groupPrompts.length) {
                    indices[counterKey] = (idx + 1) % groupPrompts.length;
                    try {
                        sessionStorage.setItem('cgptPromptIndexMap', JSON.stringify(indices));
                    } catch {
                    }
                }

                if (injectNow && mainPrompt) {
                    qsa('p', ed).forEach((p, i, arr) => {
                        const txt = p.innerText.trim();
                        if ((txt === groupPrompt || txt === inputPrompt) && i !== arr.length - 1) p.remove();
                    });
                }
                const toggles = window.__cgptPromptTogglePerPath || {};
                const toggleOn = toggles[counterKey] !== false;

                // 若本次需要注入 prompt（组内、输入框二者合并）
                if (injectNow && mainPrompt && toggleOn) {
                    qsa('p', ed).forEach((p, i, arr) => {
                        const txt = p.innerText.trim();
                        if ((txt === groupPrompt || txt === inputPrompt || txt === 'Task content:') && i !== arr.length - 1) p.remove();
                    });
                    const frag = document.createDocumentFragment();
                    const gp = document.createElement('p');

                    let merged = mainPrompt;
                    if (groupPrompt && inputPrompt) {
                        const clean = s => String(s).replace(/^※+/, '').replace(/※+$/, '').trim();
                        const left = clean(inputPrompt).replace(/[;；:。!? \t]+$/, '');
                        const right = clean(groupPrompt).replace(/^[;；:。!? \t]+/, '');
                        const inner = left && right ? `${left}; ${right}` : (left || right);
                        merged = `※${inner}※`;
                    }

                    try {
                        const localPending = sessionStorage.getItem('cgptPromptStyleSwitchPending') === '1';

                        let crossShouldPrepend = false;
                        const token = sessionStorage.getItem('cgptPromptStyleCrossToken'); // ← 周期 token 是否存在
                        if (token) {
                            const here = location.pathname || '';
                            const last = sessionStorage.getItem('cgptCrossLastPath') || '';
                            if (here.startsWith('/c/') && last.startsWith('/c/') && here !== last) {
                                crossShouldPrepend = true;
                            }
                            try {
                                sessionStorage.setItem('cgptCrossLastPath', here);
                            } catch {
                            }
                        }

                        // 仅在“已有会话（/c/）”里才前置那句英文提示；新建对话页（/）不加
                        const isExistingChat = location.pathname.startsWith('/c/');

                        if ((localPending || crossShouldPrepend) && isExistingChat) {
                            const prepend = 'Switch style:';
                            const inner = String(merged).replace(/^※+/, '').replace(/※+$/, '');
                            merged = `※${prepend}${inner}※`;

                            if (localPending) {
                                sessionStorage.removeItem('cgptPromptStyleSwitchPending'); // 本会话一次性仍然只用一次
                            }
                        }
                    } catch {
                    }


                    const mergedClean = String(merged).replace(/^※+/, '').replace(/※+$/, '').trim();
                    if (mergedClean) {
                        // 新增：在修改 DOM 前先判断“是否已有用户文本”
                        const hadUserText = ((ed.innerText || '').trim().length > 0);

                        gp.textContent = merged;
                        frag.appendChild(gp);

                        // 修改：只有当“已有用户文本”时，才插入 Task content:
                        if (hadUserText) {
                            const tc = document.createElement('p');
                            tc.textContent = 'Task content:';
                            frag.appendChild(tc);
                        }

                        ed.prepend(frag);
                        changed = true;
                    }
                }

                if (!skipSuffixOnce && SUFFIX && !(ed.lastElementChild && ed.lastElementChild.innerText.trim() === SUFFIX)) {
                    const p = document.createElement('p');
                    p.textContent = SUFFIX;
                    ed.appendChild(p);
                    changed = true;
                }

                if (changed) {
                    ed.dispatchEvent(new Event('input', {bubbles: true}));
                }
            }

            function ensureChatRegistered() {
                if (location.pathname.startsWith('/c/')) return;
                const watcher = setInterval(() => {
                    if (location.pathname.startsWith('/c/')) {
                        clearInterval(watcher);
                        const p = location.pathname;
                        window.bumpActiveChat?.();
                        window.scheduleHistoryRefresh?.(p);
                        window.__cgptMonitorFirstAnswerThenReload?.(); // 仍保留原先DOM方案
                        try {
                            __cgptEnsureHistoryRowFor?.(p);
                        } catch {
                        }
                    }
                }, 120);
            }


            function isUploading() {
                const form = qs('form[data-type="unified-composer"]');
                if (!form) return false;
                const btn = qs('#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send"]', form);
                const buttonBusy = !!(btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true'));
                const hasProgress = !!form.querySelector('[role="progressbar"],progress,[data-state="uploading"],[aria-busy="true"]');
                return buttonBusy || hasProgress;
            }

            function hasAttachments() {
                const form = qs('form[data-type="unified-composer"]');
                if (!form) return false;

                const strip = form.querySelector('.cgpt-attach-strip, .horizontal-scroll-fade-mask');
                if (strip && strip.childElementCount > 0) return true;

                return !!form.querySelector(
                    '[data-testid*="file" i], [data-testid*="attach" i], ' +
                    '[aria-label*="file" i], [aria-label*="附件"], [aria-label*="文件"], ' +
                    '[data-state="complete"][role="img"]'
                );
            }

            function bindSend() {
                // 新增：统一获取编辑器，兼容 ProseMirror 与 textarea
                const getEditor = () =>
                    qs('.ProseMirror') || qs('#prompt-textarea') || qs('[contenteditable="true"]');

                // 兼容新版界面多种发送按钮写法
                const send = qs('#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send"]');

                try {
                    ensurePromptToggle();
                } catch {
                }

                // 修改：不再依赖先找到编辑器才挂钩发送按钮
                if (!send) return;

                if (!send.dataset.hooked) {
                    send.dataset.hooked = "1";

                    // 修改后版本：新增 i === -1 时插入逻辑，只对 activeFid 生效
                    const bumpActiveChat = () => {
                        if (!location.pathname.startsWith('/c/')) return;
                        const cur = location.href;
                        // 优先从 history 里取标题，取不到就用“new chat”
                        const histRoot = qs('div#history') || qs('nav[aria-label="Chat history"]');
                        const title = histRoot?.querySelector(`a[href*="${location.pathname}"]`)?.textContent.trim() || 'New chat';
                        const curPath = new URL(cur).pathname;

                        if (window.__cgptPendingToken) {
                            const oldKey = '/' + window.__cgptPendingToken;
                            const counters = window.__cgptPromptGapCounters;
                            if (counters[oldKey] !== undefined && counters[curPath] === undefined) {
                                counters[curPath] = counters[oldKey];
                            }
                            delete counters[oldKey];

                            const idxMap = window.__cgptPromptIndexMap;
                            if (idxMap[oldKey] !== undefined && idxMap[curPath] === undefined) {
                                idxMap[curPath] = idxMap[oldKey];
                            }
                            delete idxMap[oldKey];

                            // 新增：迁移 prompt 开关映射
                            const toggles = window.__cgptPromptTogglePerPath || {};
                            if (toggles[oldKey] !== undefined && toggles[curPath] === undefined) {
                                toggles[curPath] = toggles[oldKey];
                            }
                            delete toggles[oldKey];

                            try {
                                sessionStorage.setItem('cgptPromptGapCounters', JSON.stringify(counters));
                                sessionStorage.setItem('cgptPromptIndexMap', JSON.stringify(idxMap));
                                sessionStorage.setItem('cgptPromptToggle', JSON.stringify(toggles));
                            } catch {
                            }
                        }


                        let folderFid = activeFid && folders[activeFid] ? activeFid : null;
                        if (!folderFid) {
                            const cand = lastActiveMap[curPath];
                            if (cand && cand !== '__history__' && folders[cand]) {
                                folderFid = cand;
                                activeFid = cand;
                            }
                        }

                        if (!folderFid && window.__cgptPendingFid &&
                            folders[window.__cgptPendingFid]) {
                            folderFid = window.__cgptPendingFid;
                            activeFid = folderFid;
                        }
                        if (!folderFid) {
                            for (const [fid, folder] of Object.entries(folders)) {
                                if (folder.chats.some(c => samePath(c.url, cur))) {
                                    folderFid = fid;
                                    activeFid = fid;
                                    break;
                                }
                            }
                        }

                        const folder = folderFid ? folders[folderFid] : null;
                        if (!folder) return;
                        if (folderFid && !lastActiveMap[curPath]) {
                            lastActiveMap[curPath] = folderFid;
                            if (chrome?.runtime?.id) storage.set({lastActiveMap});
                        }
                        const i = folder.chats.findIndex(c => samePath(c.url, cur));
                        let needRender;

                        // 识别当前三角标是否确实指向该组
                        const cornerEl = document.querySelector(`.cgpt-folder-corner[data-fid="${activeFid}"]`);
                        const triangleOn = !!cornerEl && cornerEl.style && cornerEl.style.borderTopColor && cornerEl.style.borderTopColor !== 'transparent';
                        const triangleOwnsThis = triangleOn && activeFid && folderFid === activeFid;

                        if (i >= 0) {                           // 已在当前分组
                            const [chat] = folder.chats.splice(i, 1);
                            folder.chats.unshift(chat);
                            needRender = i > 0;
                        } else if (window.__cgptPendingFid === folderFid || triangleOwnsThis) {
                            // 新建流程或三角标明确选中该组时，将新会话纳入该组
                            folder.chats.unshift({url: cur, title});
                            needRender = true;
                        } else {
                            return;                             // 其余场景保持原有保护
                        }


                        safeSendMessage({type: 'save-folders', data: folders});

                        if (needRender) {
                            // 精准更新：只替换当前分组节点，避免等待整块异步分帧渲染
                            const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(3)');
                            const fidList = Object.keys(folders);
                            const idx = fidList.indexOf(folderFid);
                            const oldBox = folderZone && folderZone.children && folderZone.children[idx];
                            if (folderZone && oldBox) {
                                const newBox = renderFolder(folderFid, folders[folderFid]);
                                folderZone.replaceChild(newBox, oldBox);
                            } else {
                                render(); // 兜底：若定位失败，再走全量渲染
                            }
                        }              // 根据标志决定是否重绘
                        highlightActive();                      // 始终保持高亮状态

                        if (window.__cgptPendingFid === folderFid) {
                            window.__cgptPendingFid = null;
                            window.__cgptPendingToken = null;
                        }
                        ensurePromptToggle();
                    };

                    window.bumpActiveChat = bumpActiveChat;

                    // 等待窗口改为 15 s，刷新间隔固定 500 ms
                    function scheduleHistoryRefresh(targetPath) {
                        const getHist = () => qs('div#history') || qs('nav[aria-label="Chat history"]');

                        const insertHistoryEntry = () => {
                            const hist = getHist();
                            if (!hist) return;

                            const target = targetPath || location.pathname;   // 允许外部显式指定目标
                            if (hist.querySelector(`a[href*="${target}"]`)) return;
                            const a = document.createElement('a');
                            a.href = target;
                            a.dataset.url = target;                           // 占位标记
                            a.textContent = 'New chat';
                            a.style.cssText = 'display:block;padding:6px 12px;font-size:13px;line-height:1.25;border-radius:6px;color:#b2b2b2;text-decoration:none;';
                            const li = document.createElement('li');
                            li.style.display = 'none';
                            li.dataset.cgptPlaceholder = '1';
                            li.appendChild(a);
                            hist.insertBefore(li, hist.firstChild);
                        };

                        const watch = () => {
                            insertHistoryEntry();
                            const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');
                            if (!hist) return;
                            const target = targetPath || location.pathname;
                            const moveIfReady = () => {
                                const ok =
                                    qs(`div#history a[href*="${target}"]:not([data-url])`) ||
                                    qs(`nav[aria-label="Chat history"] a[href*="${target}"]:not([data-url])`);
                                if (ok) {
                                    const placeholder =
                                        qs(`div#history a[data-url="${target}"]`) ||
                                        qs(`nav[aria-label="Chat history"] a[data-url="${target}"]`);
                                    if (placeholder && placeholder !== ok) {
                                        try {
                                            (typeof detachLink === 'function') && detachLink(placeholder);
                                        } catch (e) {
                                        }
                                        placeholder.closest('li')?.remove();
                                    }
                                    refreshHistoryOrder();
                                    return true;
                                }
                                return false;
                            };
                            if (moveIfReady()) return;
                            const ob = new MutationObserver(() => {
                                if (moveIfReady()) ob.disconnect();
                            });
                            ob.observe(hist, {childList: true, subtree: true});
                            setTimeout(() => ob.disconnect(), 60000);
                        };

                        if ((targetPath || location.pathname).startsWith('/c/')) {
                            watch();
                        } else {
                            const once = () => {
                                if (!location.pathname.startsWith('/c/')) return;
                                window.removeEventListener('popstate', once);
                                watch();
                            };
                            window.addEventListener('popstate', once);
                        }

                        setTimeout(() => {
                            try {
                                const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');
                                const target = targetPath || location.pathname;
                                if (hist && !qs(`div#history a[href*="${target}"]`, hist)) {
                                    scheduleHistoryRefresh(targetPath);        // 递归时继续盯同一个目标
                                    refreshHistoryOrder();
                                }
                            } catch (e) {
                            }
                        }, 1500);
                    }


                    // 新增：首次回答结束→3秒→调用conversations→局部刷新
                    (function () {
                        function __cgptBuildAcceptLanguage() {
                            const ls = (Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || 'en-US'])
                                .map(s => String(s || '').split(';')[0]).filter(Boolean);
                            const uniq = [...new Set(ls)].slice(0, 4);
                            if (!uniq.length) return 'en-US,en;q=0.9';
                            const qs = [1.0, 0.9, 0.8, 0.7];
                            return uniq.map((l, i) => i === 0 ? l : `${l};q=${qs[i].toFixed(1)}`).join(',');
                        }

                        async function __cgptGetAuthHeaders() { // 授权参考Batch Delete中的getHeaders实现:contentReference[oaicite:1]{index=1}
                            const h = {
                                accept: '*/*',
                                'accept-language': __cgptBuildAcceptLanguage(),
                                'content-type': 'application/json'
                            };
                            try {
                                const r = await fetch('/api/auth/session', {credentials: 'same-origin'});
                                if (r.ok) {
                                    const j = await r.json();
                                    if (j && j.accessToken) h.authorization = `Bearer ${j.accessToken}`;
                                }
                            } catch {
                            }
                            return h;
                        }

                        // 新增：把返回数据用于最小 DOM 补丁，确保 Chats 可见
                        function __cgptPatchChatsFromResponse(data, opts = {}) {
                            try {
                                const explicitPath = opts.path || null;
                                const idFromOpt = opts.id || (explicitPath ? (/\/c\/([^/?#]+)/.exec(explicitPath) || [])[1] : null);
                                const idMatch = /\/c\/([^/?#]+)/.exec(location.pathname);
                                const curId = idFromOpt || (idMatch && idMatch[1]);
                                if (!curId || !data) return;

                                const list = Array.isArray(data.items) ? data.items
                                    : Array.isArray(data.conversations) ? data.conversations : [];
                                const item = list.find(it => it?.id === curId || it?.conversation_id === curId);
                                if (!item) return;

                                const title = String(item.title || 'New chat');
                                const hist = document.querySelector('div#history') || document.querySelector('nav[aria-label="Chat history"]');
                                if (!hist) return;

                                const chatsAside = hist.querySelector('aside[aria-labelledby]') || hist;
                                const path = '/c/' + curId;
                                let row = chatsAside.querySelector(`a[href*="${path}"]`);
                                if (!row) {
                                    const tplLink = chatsAside.querySelector('a[href^="/c/"]');
                                    const tplItem = tplLink && (tplLink.closest('li') || tplLink);
                                    if (tplItem) {
                                        const clone = tplItem.cloneNode(true);
                                        const link = clone.querySelector('a[href^="/c/"]') || clone;
                                        link.href = path;
                                        if (link.hasAttribute('data-url')) link.setAttribute('data-url', path); else link.removeAttribute('data-url');
                                        link.removeAttribute('aria-current');
                                        link.removeAttribute('target');
                                        link.setAttribute('data-discover', 'true');
                                        const titleEl =
                                            link.querySelector('.truncate') ||
                                            link.querySelector('[data-testid="conversation-item-title"]') ||
                                            link;
                                        titleEl.textContent = title;
                                        clone.querySelectorAll('[class]').forEach(n => {
                                            if (/\bbg-token-/.test(n.className)) n.className = n.className.replace(/\bbg-token-[^\s]+/g, '').trim();
                                        });
                                        const listEl = tplItem.parentElement && /^(UL|OL)$/.test(tplItem.parentElement.tagName) ? tplItem.parentElement : null;
                                        if (listEl) listEl.insertBefore(clone, listEl.firstChild);
                                        else chatsAside.insertBefore(clone, tplItem);
                                        row = link;
                                    } else {
                                        const li = document.createElement('li');
                                        const a = document.createElement('a');
                                        a.href = path;
                                        a.setAttribute('data-url', path);
                                        a.setAttribute('data-discover', 'true');
                                        a.className = 'group __menu-item hoverable gap-1.5';
                                        a.textContent = title;
                                        li.appendChild(a);
                                        const ul = chatsAside.querySelector('ul,ol');
                                        if (ul) ul.insertBefore(li, ul.firstChild);
                                        else chatsAside.insertBefore(li, chatsAside.firstChild);
                                        row = a;
                                    }
                                } else {
                                    const textEl = row.querySelector('.truncate') || row;
                                    if (textEl.textContent !== title) textEl.textContent = title;
                                    const li = row.closest('li');
                                    if (li && li.style.display === 'none') li.style.display = '';
                                }

                                /* 新增：给条目绑定一次性 SPA 导航，避免整页刷新 */
                                if (row && !row.__cgptSpaBound) {
                                    row.__cgptSpaBound = 1;
                                    row.addEventListener('click', e => {
                                        if (e.defaultPrevented) return;
                                        // 放行复选框、按钮等交互控件
                                        if (e.target.closest('input[type="checkbox"], [data-radix-popper-content-wrapper], [data-radix-focus-guard]')) {
                                            return;
                                        }
                                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                        const href = row.getAttribute('href');
                                        if (!href) return;
                                        e.preventDefault();
                                        history.pushState({}, '', href);
                                        window.dispatchEvent(new Event('popstate'));
                                    }, {passive: false});

                                    // 防止上层其他捕获监听抢走
                                    row.addEventListener('mousedown', e => {
                                        if (e.target.closest('input[type="checkbox"], [data-radix-popper-content-wrapper], [data-radix-focus-guard]')) {
                                            e.stopPropagation();
                                        }
                                    }, true); // capture

                                    // 兜底样式，避免遮罩挡点
                                    document.head.insertAdjacentHTML('beforeend', `
                                <style>
                                  a [data-radix-popper-content-wrapper],
                                  a [data-radix-focus-guard],
                                  a input[type="checkbox"] { pointer-events:auto; position:relative; z-index:1; }
                                </style>
                                `);

                                }

                                // 维持选中态与顺序
                                try {
                                    refreshHistoryOrder();
                                } catch {
                                }
                            } catch {
                            }
                        }

                        async function __cgptFetchConversationsAndRefresh(explicitIdOrPath) {
                            try {
                                const headers = await __cgptGetAuthHeaders();
                                const res = await fetch('/backend-api/conversations?offset=0&limit=5&order=updated&is_archived=false', {
                                    headers,
                                    credentials: 'same-origin'
                                });
                                if (!res.ok) return;

                                const json = await res.json().catch(() => null);
                                if (!json) return;

                                const list = Array.isArray(json.items) ? json.items
                                    : Array.isArray(json.conversations) ? json.conversations
                                        : [];

                                const hasNewChat = list.some(it => String(it?.title || '').trim().toLowerCase() === 'new chat');
                                if (hasNewChat) return;

                                const opts = typeof explicitIdOrPath === 'string'
                                    ? (explicitIdOrPath.startsWith('/c/') ? {path: explicitIdOrPath} : {id: explicitIdOrPath})
                                    : {};
                                __cgptPatchChatsFromResponse(json, opts);

                                try {
                                    scheduleHistoryRefresh(explicitIdOrPath && explicitIdOrPath.startsWith('/c/') ? explicitIdOrPath : undefined);
                                } catch {
                                }
                            } catch {
                            }
                        }


                        function __cgptMonitorFirstAnswerThenReload() {
                            if (!location.pathname.startsWith('/c/')) return;
                            const m = /\/c\/([^/?#]+)/.exec(location.pathname);
                            const id = m && m[1];
                            if (!id) return;
                            window.__cgptFirstReplyDoneMap = window.__cgptFirstReplyDoneMap || {};
                            if (window.__cgptFirstReplyDoneMap[id]) return;
                            Date.now();
                            const sel = '#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send"]';
                            const int = setInterval(() => {
                                const btn = qs(sel);
                                const label = btn ? ((btn.getAttribute('aria-label') || btn.innerText || '') + '').toLowerCase() : '';
                                const stopOn = label.includes('stop');
                                const hasAssistant = !!document.querySelector('[data-message-author-role="assistant"],[data-testid="assistant"],[data-message-role="assistant"]');
                                if (!stopOn && hasAssistant) {
                                    clearInterval(int);
                                    window.__cgptFirstReplyDoneMap[id] = 1;
                                    setTimeout(__cgptFetchConversationsAndRefresh, 3000);
                                }
                            }, 300);
                        }

                        // 小兜底：盯住某个/c/...，先做DOM占位监听，再在4s与10s各拉一次conversations列表以补条目
                        function __cgptEnsureHistoryRowFor(path) {
                            if (!path || !path.startsWith('/c/')) return;
                            try {
                                scheduleHistoryRefresh?.(path);
                            } catch {
                            }
                            const id = (/\/c\/([^/?#]+)/.exec(path) || [])[1];
                            setTimeout(() => {
                                try {
                                    __cgptFetchConversationsAndRefresh?.(id);
                                } catch {
                                }
                            }, 4000);
                            setTimeout(() => {
                                try {
                                    __cgptFetchConversationsAndRefresh?.(id);
                                } catch {
                                }
                            }, 10000);
                        }

                        window.__cgptEnsureHistoryRowFor = __cgptEnsureHistoryRowFor;

                        window.__cgptMonitorFirstAnswerThenReload = __cgptMonitorFirstAnswerThenReload;
                    })();

                    window.scheduleHistoryRefresh = scheduleHistoryRefresh;


                    // ① 发送按钮点击
                    send.addEventListener('click', () => {
                        if (isUploading()) return;
                        const label = send.getAttribute('aria-label') || send.innerText;
                        if ((label || '').toLowerCase().includes('stop')) return;

                        // 运行时再取编辑器，并区分 textarea 与 ProseMirror
                        const edNow = getEditor();
                        const hasUserInput = edNow
                            ? (edNow.tagName === 'TEXTAREA'
                                ? edNow.value.trim().length > 0
                                : (edNow.innerText || '').trim().length > 0)
                            : false;

                        if (hasUserInput || hasAttachments()) appendSuffix();
                        bumpActiveChat();
                        scheduleHistoryRefresh();
                        ensureChatRegistered();
                        ensureFrostedBG();
                        window.__cgptMonitorFirstAnswerThenReload?.();
                    }, {capture: true});
                }

                // ② 回车快捷发送：分别尝试对当前编辑器挂钩
                const ed = getEditor();
                if (ed && !ed.dataset.keyhooked) {
                    ed.dataset.keyhooked = '1';
                    ed.addEventListener('keydown', e => {
                        if (e.isComposing || e.keyCode === 229) return;
                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                            if (isUploading()) {
                                e.preventDefault();
                                return;
                            }
                            const btn = qs('#composer-submit-button');
                            if (!btn) return;
                            const label = btn.getAttribute('aria-label') || btn.innerText;
                            if ((label || '').toLowerCase().includes('stop')) return;

                            const edNow = getEditor();
                            const hasUserInput = edNow
                                ? (edNow.tagName === 'TEXTAREA'
                                    ? edNow.value.trim().length > 0
                                    : (edNow.innerText || '').trim().length > 0)
                                : false;

                            if (hasUserInput || hasAttachments()) appendSuffix();
                            bumpActiveChat();
                            ensurePromptToggle();
                            scheduleHistoryRefresh();
                            ensureChatRegistered();
                            ensureFrostedBG();
                            window.__cgptMonitorFirstAnswerThenReload?.();
                        }
                    }, {capture: true});
                }
            }

            observers.add(new MutationObserver(bindSend)).observe(document.body, {childList: true, subtree: true});
            bindSend();

            render();
            clearActiveOnHistoryClick = false;

            // ===== 全局 Delete chat 监听：点击确认删除按钮后，自动移除组内对应条目 =====
            if (!window.__cgptDeleteHooked) {
                window.__cgptDeleteHooked = true;

                // 捕获阶段先于 ChatGPT 内部逻辑执行，可在导航前拿到被删会话的 pathname
                document.addEventListener('click', ev => {
                    const btn = ev.target.closest('button[data-testid="delete-conversation-confirm-button"]');
                    if (!btn) return;                              // 非确认删除按钮

                    const delPath = location.pathname;
                    if (!delPath.startsWith('/c/')) return;

                    let changed = false;
                    // 遍历所有分组，剔除匹配 url 的会话
                    Object.entries(folders).forEach(([, f]) => {
                        const idx = f.chats.findIndex(c => samePath(c.url, location.origin + delPath));
                        if (idx !== -1) {
                            f.chats.splice(idx, 1);
                            changed = true;
                        }
                    });

                    if (changed) {
                        if (lastActiveMap[delPath]) {
                            delete lastActiveMap[delPath];
                            try {
                                storage.set({lastActiveMap});
                            } catch {
                            }
                        }
                        safeSendMessage({type: 'save-folders', data: folders});
                    }
                    removeChatDom(delPath);
                    highlightActive();
                }, true);
            }


            function highlightActive() {
                const path = location.pathname;

                /* 若仍在“New chat”挂起阶段，直接锁定该分组避免错跳 */
                if (window.__cgptPendingFid && folders[window.__cgptPendingFid]) {
                    activeFid = window.__cgptPendingFid;
                }
                if (activePath) {
                    const oldArr = liveSyncMap.get(activePath);
                    if (oldArr) oldArr.forEach(({el}) => {
                        el.style.background = '';
                        el.style.color = '#b2b2b2';
                    });
                }

                /* 新增：实时剔除失连节点，避免重复映射导致错选 */
                let arr = liveSyncMap.get(path);
                if (arr && arr.length) {
                    const live = arr.filter(item => item.el && item.el.isConnected);
                    if (live.length !== arr.length) liveSyncMap.set(path, live);
                    arr = live;
                }

                if (arr && arr.length) {
                    arr.forEach(({el}) => {
                        // 点击 history 会话时，也要同步高亮组内同一会话
                        el.style.background = 'rgba(255,255,255,0.07)';
                        el.style.color = '#fff';
                    });

                }
                activePath = path;

                const clickedFromHistory = (lastActiveMap[path] === '__history__') || clearActiveOnHistoryClick;

                let storedFid = lastActiveMap[path];
                if (!storedFid && lastClickedChatEl) {
                    const hit = arr?.find(i => i.el === lastClickedChatEl);
                    storedFid = hit?.fid;
                }

                /* 来自 Chats 时，强制不选组，不做兜底扫描 */
                if (clickedFromHistory) {
                    activeFid = null;
                } else if (storedFid && folders[storedFid]) {
                    activeFid = storedFid;
                } else if (arr && arr.length) {
                    for (const [fid, folder] of Object.entries(folders)) {
                        if (folder.chats.some(c => samePath(c.url, location.origin + path))) {
                            activeFid = fid;
                            break;
                        }
                    }
                }


                if (!window.__cgptPendingFid && activeFid) {
                    const belongs = folders[activeFid]?.chats?.some(
                        c => samePath(c.url, location.origin + path)
                    );
                    if (!belongs) {
                        const mapped = lastActiveMap[path];
                        if (mapped && mapped !== '__history__' && folders[mapped]) {
                            activeFid = mapped;           // 信任已建立的 路径→分组 映射
                        } else {
                            activeFid = null;
                        }
                    }
                }

                document.querySelectorAll('.cgpt-folder-corner').forEach(el => {
                    el.style.borderTopColor = el.dataset.fid === activeFid ? '#fff' : 'transparent';
                });
                try {
                    refreshHistoryOrder();
                } catch {
                }
                ensurePromptToggle();
            }


            highlightActive();                              // 初始渲染立即同步
            window.addEventListener('popstate', highlightActive);
            window.addEventListener('pageshow', highlightActive);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) highlightActive(); });

            /* ===== 清除组高亮：原生 New chat ===== */
            if (!window.__cgptNativeNewChatHooked) {
                window.__cgptNativeNewChatHooked = true;
                document.addEventListener('click', ev => {
                    const btn = ev.target.closest(
                        'button[aria-label="New chat"],a[data-testid="create-new-chat-button"]'
                    );
                    if (!btn) return;

                    // 若由组内“New chat”间接触发，则跳过本次清除并重置标志
                    if (window.__cgptSuppressGroupClear) {
                        delete window.__cgptSuppressGroupClear;
                        return;
                    }

                    activeFid = null;
                    delete window.__cgptPendingFid;
                    window.__cgptPendingToken = null;
                    delete lastActiveMap['/'];
                    try {
                        if (chrome?.runtime?.id) storage.set({lastActiveMap});
                    } catch {
                    }
                    setTimeout(highlightActive, 0);
                    setTimeout(() => {
                        try {
                            ensurePromptToggle();
                        } catch {
                        }
                    }, 0);

                }, true);
            }


            function checkMemoryUsage() {
                try {

                    // 检测已知的内存泄漏指标
                    cleanupLiveSyncMap();
                    const mapSize = liveSyncMap.size;
                    const observerCount = observers.list.length;

                    // 检查DOM是否存在异常
                    const wrapperExists = !!qs('#cgpt-bookmarks-wrapper');
                    const historyExists = !!(qs('div#history') || qs('nav[aria-label="Chat history"]'));

                    // 计算liveSyncMap中无效引用比例
                    let invalidRefs = 0;
                    let totalRefs = 0;

                    try {
                        liveSyncMap.forEach((arr) => {
                            if (arr && Array.isArray(arr)) {
                                const validItems = arr.filter(item => item && typeof item === 'object');
                                totalRefs += validItems.length;

                                validItems.forEach(({el}) => {
                                    if (el && typeof el === 'object' && el.nodeType &&
                                        document.body && !document.body.contains(el)) {
                                        invalidRefs++;
                                    }
                                });
                            }
                        });
                    } catch (e) {
                        console.warn('[Bookmark] Error checking map references:', e);
                    }

                    const invalidRatio = totalRefs > 0 ? invalidRefs / totalRefs : 0;
                    const significantLeak = invalidRefs >= 50;

                    console.log(`[Bookmark] Memory check: mapSize=${mapSize}, observers=${observerCount}, invalidRefs=${invalidRefs}/${totalRefs} (${(invalidRatio * 100).toFixed(1)}%)`);

                    let __domMismatchStreak = 0;
                    const domMismatch = (wrapperExists && !historyExists) || (!wrapperExists && historyExists);
                    __domMismatchStreak = domMismatch ? (__domMismatchStreak + 1) : 0;
                    const hasAnyNonZero = (mapSize > 0) || (observerCount > 0) || (invalidRefs > 0);

                    // 如果有明显异常 (地图过大或DOM不一致或太多无效引用)
                    if (mapSize > 1000 ||
                        (significantLeak && invalidRatio > 0.3) ||
                        (__domMismatchStreak >= 3 && hasAnyNonZero)) {
                        console.warn(`[Bookmark] Memory check failed: mapSize=${mapSize}, observers=${observerCount}, invalidRatio=${invalidRatio.toFixed(2)}`);

                        // 尝试清理
                        try {
                            cleanupLiveSyncMap();
                        } catch (err) {
                            console.warn('[Bookmark] Error during emergency cleanup of liveSyncMap:', err);
                        }

                        try {
                            observers.cleanup();
                        } catch (err) {
                            console.warn('[Bookmark] Error during emergency cleanup of observers:', err);
                        }

                        // 如果仍有问题，重新初始化
                        if (mapSize > 2000 ||
                            invalidRatio > 0.5 ||
                            (__domMismatchStreak >= 6 && document.readyState === 'complete')) {
                            console.warn('[Bookmark] Performing emergency reset');

                            // 添加应急日志
                            console.log('[Bookmark] Emergency reset triggered', {
                                mapSize,
                                observerCount,
                                invalidRatio,
                                wrapperExists,
                                historyExists,
                                folders: Object.keys(folders).length,
                                totalChats: Object.values(folders).reduce((sum, f) => sum + f.chats.length, 0)
                            });

                            // 移除现有DOM
                            const wrapper = qs('#cgpt-bookmarks-wrapper');
                            if (wrapper) {
                                try {
                                    wrapper.remove();
                                } catch (e) {
                                    console.error('[Bookmark] Failed to remove wrapper:', e);
                                }
                            }

                            // 执行完整清理
                            try {
                                cleanup();
                            } catch (err) {
                                console.error('[Bookmark] Failed during emergency cleanup:', err);
                            }

                            // 重新初始化
                            const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');
                            if (hist) {
                                setTimeout(() => {
                                    try {
                                        console.log('[Bookmark] Re-initializing bookmarks');
                                        initBookmarks(hist);
                                    } catch (e) {
                                        console.error('[Bookmark] Failed to reinitialize:', e);
                                    }
                                }, 500);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[Bookmark] Critical error in memory checker:', err);
                }
            }

            // 每2分钟检查一次内存状态（idle 调度，避免阻塞） ★修改
            if (window.__memoryCheckerId) clearInterval(window.__memoryCheckerId);

            const _MEM_CHECK_INTERVAL = 120_000;   // 120 000 ms = 2 min
            window.__memoryCheckerId = setInterval(() => {
                // 800 ms 超时保证即使空闲不足也会尽快执行
                enqueueIdleTask(checkMemoryUsage, 800);
            }, _MEM_CHECK_INTERVAL);
            // 正确创建cleanup函数
            // Enhanced cleanup function - replace existing cleanup function
            const cleanup = () => {
                // 移除自身的事件监听，避免重复绑定
                try {
                    window.removeEventListener('beforeunload', cleanup);
                    document.removeEventListener('spa:navigation', cleanup);
                } catch (e) {
                    console.warn('[Bookmark] Error removing cleanup listeners:', e);
                }

                // 清理所有观察器
                try {
                    observers.disconnectAll();
                } catch (e) {
                    console.warn('[Bookmark] Error disconnecting observers:', e);
                }

                // 清理定时器
                try {
                    if (window.__memoryCheckerId) {
                        clearInterval(window.__memoryCheckerId);
                        window.__memoryCheckerId = null;
                    }
                    if (window.__deepCleanerId) {
                        clearInterval(window.__deepCleanerId);
                        window.__deepCleanerId = null;
                    }
                } catch (e) {
                    console.warn('[Bookmark] Error clearing intervals:', e);
                }

                // 移除事件监听
                try {
                    window.removeEventListener('popstate', highlightActive);
                } catch (e) {
                    console.warn('[Bookmark] Error removing popstate listener:', e);
                }

                // 清理历史记录节点上的事件监听器
                try {
                    const hist = qs('div#history') || qs('nav[aria-label="Chat history"]');
                    if (hist) {
                        if (hist._folderClickHandler) {
                            hist.removeEventListener('click', hist._folderClickHandler);
                            delete hist._folderClickHandler;
                        }

                        // 清理可能的其他动态添加的事件监听器
                        const clone = hist.cloneNode(true);
                        hist.parentNode?.replaceChild(clone, hist);
                    }
                } catch (e) {
                    console.warn('[Bookmark] Error removing history event listeners:', e);
                }

                // 清理其他全局引用
                try {
                    activePath = null;
                    activeFid = null;
                    lastClickedChatEl = null;
                } catch (e) {
                    console.warn('[Bookmark] Error cleaning global references:', e);
                }

                // 标记初始化状态重置
                if (historyNode) {
                    try {
                        historyNode.dataset.ready = '';
                    } catch (e) {
                        console.warn('[Bookmark] Error resetting history node state:', e);
                    }
                }

                // 最后尝试清理liveSyncMap
                try {
                    liveSyncMap.clear();
                } catch (e) {
                    console.warn('[Bookmark] Error clearing liveSyncMap:', e);
                }

                // Optional: allow re-initialization by resetting sentinel
                try {
                    window.__cgptBookmarksInstance = false;
                } catch (e) {
                    console.warn('[Bookmark] Error resetting instance sentinel:', e);
                }
            };

            // 页面卸载时清理资源
            window.addEventListener('beforeunload', cleanup);

            // 在动态内容页面可能发生的导航事件上添加清理
            document.addEventListener('spa:navigation', cleanup);
        }

        window.initBookmarks = initBookmarks;

        /* ===== 把 ※…※ 提示语转为 <code> 显示，发送内容保持原样 ===== */
        (function promptCodeWrap() {
            const SEL = '[data-message-author-role="user"] .whitespace-pre-wrap';
            const REG = /※[\s\S]*?※/;

            function wrap(el) {
                if (!el || el.dataset.promptWrapped) return;
                const raw = el.innerText;
                const hit = raw.match(REG);
                if (!hit) return;

                const prompt = hit[0];                    // 含 ※ ※
                const rest = raw.replace(prompt, '');

                // 重建节点
                el.innerHTML = '';
                const pre = document.createElement('pre');
                pre.className = 'overflow-x-auto';
                const code = document.createElement('code');
                code.textContent = prompt.slice(1, -1)
                pre.appendChild(code);
                el.appendChild(pre);
                if (rest) el.appendChild(document.createTextNode(rest));

                el.dataset.promptWrapped = '1';           // 避免重复处理
            }

            /* 监听新消息 */
            const obs = new MutationObserver(muts => {
                muts.forEach(m => {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType !== 1) return;
                        if (n.matches?.(SEL)) wrap(n);
                        n.querySelectorAll?.(SEL).forEach(wrap);
                    });
                });
            });
            obs.observe(document.body, {childList: true, subtree: true});
        })();

        /* ===== 移除回答中的 <hr data-start data-end> 分隔线（新增） ===== */
        (function stripAnswerHrSeparators() {
            // 兜底样式：即刻隐藏目标 <hr>
            const STYLE_ID = 'cgpt-hide-hr-sep';
            if (!document.getElementById(STYLE_ID)) {
                const s = document.createElement('style');
                s.id = STYLE_ID;
                s.textContent = [
                    'article hr[data-start][data-end],',
                    '[data-message-author-role] hr[data-start][data-end],',
                    '.markdown hr[data-start][data-end]{display:none!important;}'
                ].join('');
                document.head.appendChild(s);
            }

            // 仅认为出现在消息气泡/回答容器内的 <hr> 为“需移除对象”
            const isAnswerPiece = (el) =>
                !!(el.closest?.('[data-testid^="conversation-turn-"]') ||
                    el.closest?.('[data-message-author-role]') ||
                    el.closest?.('article'));

            // 初次清理 + 供增量清理复用
            function sweep(root = document) {
                root.querySelectorAll?.('hr[data-start][data-end]').forEach(hr => {
                    if (isAnswerPiece(hr)) hr.remove();
                });
            }

            // 首次进入页面即清理一次
            sweep(document);

            // 监听后续新增节点，做增量清理（性能友好）
            const mo = new MutationObserver(muts => {
                for (const m of muts) {
                    for (const n of m.addedNodes) {
                        if (!(n instanceof Element)) continue;
                        if (n.tagName === 'HR' && n.hasAttribute('data-start') && n.hasAttribute('data-end')) {
                            if (isAnswerPiece(n)) n.remove();
                        } else {
                            sweep(n); // 只在新增分支里局部扫描
                        }
                    }
                }
            });
            mo.observe(document.body, {childList: true, subtree: true});
            window.observers?.add?.(mo); // 交由现有 observers 统一管理
        })();

    })();
// ==== event-loop stall monitor (NEW) ====
    (function monitorEventLoop(interval = 10_000, threshold = 500, cooldown = 30_000) {
        if (window.__cgptEventLoopMonitor) return;
        window.__cgptEventLoopMonitor = true;

        let last = performance.now();
        let lastReset = 0;                                  // 新增：记录上次自愈时间

        setInterval(() => {
            const now = performance.now();
            const drift = now - last - interval;
            last = now;

            if (drift > threshold) {
                if (now - lastReset < cooldown) {           // 冷却期内仅记录一次
                    // console.warn('[Bookmark] Main thread stall (cooldown):', drift);
                    return;
                }
                lastReset = now;

                // console.warn('[Bookmark] Main thread stall:', drift);
                document.getElementById('cgpt-bookmarks-wrapper')?.remove();
                window.observers?.disconnectAll?.();
                const hist = document.querySelector('div#history') || document.querySelector('nav[aria-label="Chat history"]');
                const idle = window.enqueueIdleTask ?? (fn => setTimeout(fn, 0));
                if (hist) idle(() => window.initBookmarks?.(hist));
            }
        }, interval);
    })();

// 全局保留首页“磨砂背景”的兜底层
    function ensureFrostedBG() {
        if (document.getElementById('cgpt-frosted-bg')) return;

        const root = Object.assign(document.createElement('div'), {id: 'cgpt-frosted-bg'});
        root.style.cssText = [
            'position:fixed', 'inset:0', 'pointer-events:none',
            'z-index:0', 'contain:paint', 'opacity:1'
        ].join(';');

        // 使用与ss页一致的背景素材 + 模糊，贴合原观感
        const pic = document.createElement('picture');
        const src = document.createElement('source');
        src.type = 'image/webp';
        src.srcset = [
            'https://persistent.oaistatic.com/burrito-nux/640.webp 640w',
            'https://persistent.oaistatic.com/burrito-nux/1280.webp 1280w',
            'https://persistent.oaistatic.com/burrito-nux/1920.webp 1920w'
        ].join(', ');
        pic.appendChild(src);

        const img = new Image();
        img.alt = '';
        img.loading = 'eager';
        img.fetchpriority = 'high';
        img.sizes = '100vw';
        img.srcset = src.srcset;
        img.style.cssText = [
            'position:absolute', 'inset:0', 'width:100%', 'height:100%', 'object-fit:cover',
            'transform:scale(1.02)', 'filter:blur(20px)', 'opacity:.3'
        ].join(';');
        pic.appendChild(img);

        // 顶部到下方的渐变，暗色模式下更贴近ss页表达
        const grad = document.createElement('div');
        grad.style.cssText = [
            'position:absolute', 'inset:0',
            'background:linear-gradient(to bottom, rgba(0,0,0,0) 0%, var(--token-main-surface, #000) 100%)',
            'opacity:.6'
        ].join(';');

        root.append(pic, grad);
        document.body.prepend(root);
    }

// 兜底：若节点被SPA切换移除，自动恢复
    (function keepFrostedBgAlive() {
        const ob = new MutationObserver(() => {
            if (!document.getElementById('cgpt-frosted-bg')) ensureFrostedBG();
        });
        ob.observe(document.body, {childList: true});
        ensureFrostedBG();
    })();

// 新增：顶栏磨砂，限定 header#page-header，避免误伤其它区域
    (function ensureFrostedHeader() {
        const ID = 'cgpt-frosted-header-style';
        if (document.getElementById(ID)) return;
        const s = document.createElement('style');
        s.id = ID;
        s.textContent = [
            'header#page-header{',
            'background:rgba(0,0,0,.15)!important;',
            '-webkit-backdrop-filter:blur(16px) saturate(120%);',
            'backdrop-filter:blur(16px) saturate(120%);',
            '}'
        ].join('');
        document.head.appendChild(s);
    })();

    // 侧边栏磨砂：先清空父层纯色，再给 nav 加模糊
    (function ensureFrostedSidebar() {
        const ID = 'cgpt-frosted-sidebar-style';
        if (document.getElementById(ID)) return;
        const s = document.createElement('style');
        s.id = ID;
        s.textContent = [
            '#stage-slideover-sidebar,#stage-slideover-sidebar .bg-token-bg-elevated-secondary,#stage-slideover-sidebar [class*="bg-token-bg-elevated-secondary"]{background:transparent!important;background-color:transparent!important;}',
            '#stage-slideover-sidebar nav[aria-label="Chat history"] .sticky{background:rgba(0,0,0,.15)!important;-webkit-backdrop-filter:blur(16px) saturate(120%);backdrop-filter:blur(16px) saturate(120%);}',
            'html.light #stage-slideover-sidebar nav[aria-label="Chat history"] .sticky{background:rgba(255,255,255,.15)!important;-webkit-backdrop-filter:blur(16px) saturate(120%);backdrop-filter:blur(16px) saturate(120%);}',

            '#stage-slideover-sidebar aside.bg-token-bg-elevated-secondary, #stage-slideover-sidebar aside[class="bg-token-bg-elevated-secondary"]{background:rgba(0,0,0,.15)!important;-webkit-backdrop-filter:blur(16px) saturate(120%);backdrop-filter:blur(16px) saturate(120%);}',
            'html.light #stage-slideover-sidebar aside.bg-token-bg-elevated-secondary, html.light #stage-slideover-sidebar aside[class*="bg-token-bg-elevated-secondary"]{background:rgba(255,255,255,.15)!important;-webkit-backdrop-filter:blur(16px) saturate(120%);backdrop-filter:blur(16px) saturate(120%);}'
        ].join('');
        document.head.appendChild(s);
    })();
}