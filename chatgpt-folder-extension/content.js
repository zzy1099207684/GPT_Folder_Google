(() => { // 立即执行函数隔离作用域
    /* ===== 通用工具 ===== */
    const CLS = {tip: 'cgpt-tip'};                                                      // 样式类名常量
    const COLOR = {bgLight: 'rgba(255,255,255,.05)', bgHover: 'rgba(255,255,255,.1)'}; // 统一颜色常量
    const samePath = (a, b) => new URL(a, location.origin).pathname === new URL(b, location.origin).pathname; // 比较路径
    const qs = (sel, root = document) => root.querySelector(sel);                        // 简写 querySelector
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));        // 简写 querySelectorAll

    /* ===== 高效封装 storage ===== */
    const storage = {
        safeSet(obj) {
            if (!chrome?.runtime?.id) return; // 上下文无效，直接忽略
            try {
                chrome.storage.sync.set(obj);
            } catch (e) {/* 静默忽略 */}
        },
        async get(key) {
            try {
                return (await chrome.storage.sync.get(key))[key];
            } catch (e) {
                console.warn('[Bookmark] storage.get error', e);
                return null;
            }
        },
        async set(obj) {
            try {
                await chrome.storage.sync.set(obj);
            } catch (e) {
                console.warn('[Bookmark] storage.set error', e);
            }
        },
    };

    /* ===== 提示气泡 ===== */
    const TIP_ID = 'cgpt-tip-style';                                                           // 样式元素 id
    if (!document.getElementById(TIP_ID)) {                                                   // 若未注入则注入
        const s = document.createElement('style');                                            // 创建 style
        s.id = TIP_ID;                                                                        // 赋 id
        s.textContent = `.${CLS.tip}{position:fixed;z-index:2147483647;padding:6px 10px;border-radius:6px;font-size:12px;background:#333;color:#fff;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.12);animation:fade .15s both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1}}`;
        document.head.appendChild(s);                                                         // 注入
    }
    const tip = (el, txt) => {                                                                // 显示提示气泡
        const d = Object.assign(document.createElement('div'), {className: CLS.tip, textContent: txt});
        document.body.appendChild(d);                                                         // 插入 body
        const r = el.getBoundingClientRect();                                                 // 目标位置
        d.style.left = r.left + r.width / 2 - d.offsetWidth / 2 + 'px';                       // 水平
        d.style.top = r.top - d.offsetHeight - 6 + 'px';                                      // 垂直
        return () => d.remove();                                                              // 返回关闭函数
    };

    /* ===== 全局数据 ===== */
    let folders = {};                                                                         // 收藏夹数据

    /* ===== 等待侧栏就绪 ===== */
    const readyObs = new MutationObserver(() => {
        const hist = qs('div#history');
        if (hist && !hist.dataset.ready) {
            hist.dataset.ready = 1;
            initBookmarks(hist);
        }
    });
    readyObs.observe(document.body, {childList: true, subtree: true});                        // 监听

    /* ===== 初始化收藏夹 ===== */
    async function initBookmarks(historyNode) {
        if (qs('#cgpt-bookmarks-wrapper')) return;                                            // 防重复

        /* ---------- DOM 构建 ---------- */
        const wrap = Object.assign(document.createElement('div'), {
            id: 'cgpt-bookmarks-wrapper',
            style: 'width:100%;margin-bottom:4px'
        });
        const inner = Object.assign(document.createElement('div'), {style: 'padding:4px 0'});
        const bar = Object.assign(document.createElement('div'), {
            textContent: 'Groups',
            style: 'display:flex;align-items:center;font:bold 14px/1 white;padding:4px 12px'
        });
        const addBtn = Object.assign(document.createElement('span'), {
            textContent: '+',
            style: 'cursor:pointer;margin-left:auto;font-weight:bold'
        });
        addBtn.addEventListener('click', async () => {
            const n = prompt('group name');
            if (!n || !n.trim()) return;
            const id = 'f_' + Date.now();
            folders[id] = { name: n.trim(), chats: [], collapsed: false };
            await storage.set({ folders });
            render();
        });
        bar.appendChild(addBtn);
        const folderZone = Object.assign(document.createElement('div'), {style: 'padding:0 12px'});
        inner.append(bar, folderZone);
        wrap.appendChild(inner);
        historyNode.parentElement.insertBefore(wrap, historyNode);                            // 插入侧栏顶部

        /* ---------- 数据读取 ---------- */
        folders = (await storage.get('folders')) || {};                                       // 异步读取

        /* ---------- 辅助函数 ---------- */
        const liveSyncMap = new Map();                                // 路径 => [{ fid, el }]
        const debounce = (fn, wait = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
        const syncTitles = debounce(() => {
            let updated = false;
            liveSyncMap.forEach((arr, path) => {
                const a = qs(`div#history a[href*="${path}"]`);
                if (!a) {  // 会话已被删除
                    arr.forEach(({ fid, el }) => {
                        const folder = folders[fid];
                        if (!folder) return;
                        const before = folder.chats.length;
                        folder.chats = folder.chats.filter(c => !samePath(c.url, location.origin + path));
                        if (folder.chats.length !== before) updated = true;
                    });
                    return;
                }
                const t = (a.textContent || '新对话').trim();
                arr.forEach(({ fid, el }) => {
                    if (el.textContent !== t) el.textContent = t;
                    const folder = folders[fid];
                    if (!folder) return;
                    const chat = folder.chats.find(c => samePath(c.url, location.origin + path));
                    if (chat && chat.title !== t) {
                        chat.title = t;
                        updated = true;
                    }
                });
            });
            if (updated) storage.set({ folders });
        }, 200);

        new MutationObserver(syncTitles).observe(document.body, { childList: true, subtree: true, characterData: true });

        /* —— 检测 history 会话被删除后同步移除收藏夹中对应条目 —— */
        const historyCleanupObs = new MutationObserver(() => {
            const activePaths = new Set(
                qsa('div#history a[href*="/c/"]').map(a => new URL(a.href).pathname)
            );
            let changed = false;

            for (const [fid, folder] of Object.entries(folders)) {
                const oldChats = folder.chats;
                const newChats = oldChats.filter(c => {
                    if (!c.url) return true;             // 没有 URL 的条目（待定占位）直接保留
                    try {
                        return activePaths.has(new URL(c.url).pathname);
                    } catch {                            // URL 非法时也保留，防止误删
                        return true;
                    }
                });
                if (newChats.length !== oldChats.length) {
                    folder.chats = newChats;
                    changed = true;
                    const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(2)');
                    const oldBox = folderZone.children[Object.keys(folders).indexOf(fid)];
                    const newBox = renderFolder(fid, folder);
                    folderZone.replaceChild(newBox, oldBox);
                }
            }
            if (changed) storage.set({ folders });
        });
        historyCleanupObs.observe(qs('div#history'), { childList: true, subtree: true });

        /* ---------- 渲染 ---------- */
        function render() {
            folderZone.replaceChildren();
            Object.entries(folders).forEach(([id, f]) => folderZone.appendChild(renderFolder(id, f)));
        }

        /* ---------- 文件夹渲染 ---------- */
        function renderFolder(fid, f) {
            const box = document.createElement('div');
            box.style.marginTop = '4px';

            const header = document.createElement('div');
            header.style.cssText = `cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:4px 6px;background:${COLOR.bgLight};border-radius:4px`;
            const arrow = document.createElement('span');
            arrow.textContent = f.collapsed ? '▶' : '▼';
            const lbl = document.createElement('span');
            lbl.textContent = f.name;
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.gap = '6px';
            left.append(arrow, lbl);

            const newBtn = document.createElement('a');
            newBtn.href = 'javascript:void 0';
            newBtn.style.cssText = 'flex h-8 w-8 items-center justify-center rounded-lg';
            newBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.673 3.913a3 3 0 0 1 4.414 4.414l-5.938 5.938a3 3 0 0 1-1.457.79l-2.18.311a.5.5 0 0 1-.565-.565l.311-2.18a3 3 0 0 1 .79-1.457l5.938-5.938Z"/><path d="M18.673 5.327a1.5 1.5 0 0 0-2.121 0l-5.938 5.938a1.5 1.5 0 0 0-.43.729l-.123.86.86-.123a1.5 1.5 0 0 0 .729-.43l5.938-5.938a1.5 1.5 0 0 0 0-2.121Z"/></svg>';
            let hideTip;
            newBtn.onmouseenter = () => hideTip = tip(newBtn, '新聊天');
            newBtn.onmouseleave = () => hideTip && hideTip();

            const del = Object.assign(document.createElement('span'), {
                textContent: '✖',
                style: 'color:white;cursor:pointer;margin-left:6px'
            });

            header.append(left, newBtn, del);

            const ul = document.createElement('ul');
            ul.style.cssText = `list-style:none;padding-left:8px;margin:4px 0 0;${f.collapsed ? 'display:none' : ''}`;
            f.chats.forEach(c => renderChat(ul, fid, c));

            header.onclick = async () => {
                f.collapsed = !f.collapsed;
                await storage.set({folders});
                render();
            };
            del.onclick = async e => {
                e.stopPropagation();
                delete folders[fid];
                await storage.set({folders});
                render();
            };

            // -------- newBtn.onclick 重新实现 --------
            /* ---------- newBtn.onclick 修订版 ---------- */
            newBtn.onclick = e => {                          // 点击“新聊天”按钮时触发
                e.stopPropagation();                         // 阻止点击事件冒泡，避免折叠文件夹
                const prevPaths = new Set(                   // 记录当前侧栏里已有的所有会话 pathname
                    qsa('div#history a[href*="/c/"]').map(a => new URL(a.href).pathname)
                );
                history.pushState({}, '', '/');              // 跳到根路径，真正开启一个新会话
                window.dispatchEvent(new Event('popstate')); // 手动触发路由更新事件

                const iv = setInterval(async () => {         // 轮询检测是否生成了全新会话
                    if (!location.pathname.startsWith('/c/')) return; // 还没进入 /c/xxx 直接返回
                    const path = location.pathname;          // 当前会话的 pathname，例如 /c/abcd1234
                    if (prevPaths.has(path)) return;         // 若 pathname 已存在，说明用户切回旧会话
                    if (folders[fid]?.chats.some(c => samePath(c.url, location.origin + path))) return; // 已收录则返回

                    const anchor = qs(`div#history a[href$="${path}"]`); // 查找侧栏中新会话链接
                    if (!anchor) return;                    // 链接尚未出现说明首条消息还未真正保存

                    folders[fid].chats.push({               // 写入真正的新会话条目
                        url: location.href,                 // 完整会话 URL
                        title: anchor.textContent.trim() || '加载中…' // 使用侧栏展示的实时标题
                    });
                    await storage.set({ folders });          // 同步到 chrome.storage
                    render();                                // 重新渲染收藏夹区域
                    clearInterval(iv);                       // 成功后停止轮询
                }, 300);                                     // 每 300 ms 检查一次
            };



            header.ondragover = e => {
                e.preventDefault();
                header.style.background = COLOR.bgHover;
            };
            header.ondragleave = () => header.style.background = COLOR.bgLight;
            header.ondrop = async e => {
                e.preventDefault();
                header.style.background = COLOR.bgLight;
                const url = e.dataTransfer.getData('text/plain');
                if (!url || f.chats.some(c => samePath(c.url, url))) return;
                const t = qsa('a[href*="/c/"]').find(a => samePath(a.href, url))?.textContent.trim() || '会话';
                f.chats.push({url, title: t});
                await storage.set({folders});
                render();
            };

            box.append(header, ul);
            return box;
        }

        /* ---------- 聊天渲染 ---------- */
        function renderChat(parentUl, fid, chat) {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:2px 0';

            const link = document.createElement('a');
            link.href = chat.url || 'javascript:void 0';
            link.textContent = chat.title;
            link.style.cssText = 'flex:1;margin-right:4px;font-size:13px;color:#b2b2b2;text-decoration:none';
            link.onclick = e => {
                if (!chat.url) return;                                   // 待定条目禁用点击
                e.preventDefault();
                history.pushState({}, '', chat.url);
                window.dispatchEvent(new Event('popstate'));
            };

            const del = Object.assign(document.createElement('span'), { textContent: '✖', style: 'cursor:pointer;color:while' });
            del.onclick = async () => {
                folders[fid].chats = folders[fid].chats.filter(c => !samePath(c.url, chat.url));
                await storage.set({ folders });
                render();
            };

            li.append(link, del);
            parentUl.appendChild(li);

            /* —— 建立多对一同步映射 —— */
            if (chat.url) {                                              // URL 非空才加入同步映射
                const path = new URL(chat.url).pathname;
                if (!liveSyncMap.has(path)) liveSyncMap.set(path, []);
                const arr = liveSyncMap.get(path);
                if (!arr.some(item => item.el === link)) arr.push({ fid, el: link });
            }
        }

        /* ---------- 拖拽源委托 ---------- */
        const dragSrcObs = new MutationObserver(() => {
            qsa('a[href*="/c/"]').forEach(a => {
                if (a.dataset.drag) return;
                a.dataset.drag = 1;
                a.draggable = true;
                a.ondragstart = e => e.dataTransfer.setData('text/plain', a.href);
            });
        });
        dragSrcObs.observe(qs('div#history') || document.body, {childList: true, subtree: true});

        /* ---------- 移除压缩按钮 ---------- */
        new MutationObserver(() => qsa('path[d^="M316.9 18"]').forEach(p => p.closest('button')?.remove()))
            .observe(document.body, {childList: true, subtree: true});

        /* ---------- 输入尾部提示 ---------- */
        function appendSuffix() {
            const ed = qs('.ProseMirror');
            if (!ed) return;
            qsa('p', ed).forEach((p, i, arr) => {
                if (p.innerText === '恢复最初输出风格' && p !== arr[arr.length - 1]) p.remove();
            });
            const last = ed.lastElementChild;
            if (!(last && last.innerText === '恢复最初输出风格')) {
                const p = document.createElement('p');
                p.textContent = '恢复最初输出风格';
                ed.appendChild(p);
                ed.dispatchEvent(new Event('input', {bubbles: true}));
            }
        }

        function bindSend() {
            const ed = qs('.ProseMirror');
            const send = qs('#composer-submit-button');
            if (!ed || !send || send.dataset.hooked) return;
            send.dataset.hooked = 1;
            send.addEventListener('click', appendSuffix, {capture: true});
            ed.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) appendSuffix();
            }, {capture: true});
        }

        new MutationObserver(bindSend).observe(document.body, {childList: true, subtree: true});
        bindSend();

        render();
    }
})();
