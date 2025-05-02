(() => { // 立即执行函数隔离作用域
    /* ===== 通用工具 ===== */
    const CLS = {tip: 'cgpt-tip'};                                                      // 样式类名常量
    const COLOR = {bgLight: 'rgba(255,255,255,.05)', bgHover: 'rgba(255,255,255,.1)'}; // 统一颜色常量
    const samePath = (a, b) => new URL(a, location.origin).pathname === new URL(b, location.origin).pathname; // 比较路径
    const qs = (sel, root = document) => root.querySelector(sel);                        // 简写 querySelector
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));        // 简写 querySelectorAll
    // let pending = {};                                                        // 聚合待写入数据
    // let timer = null;
    /* ===== 高效封装 storage ===== */
    const storage = {
        async get(key) {
            try {
                return (await chrome.storage.sync.get(key))[key];
            } catch (e) {
                console.warn('[Bookmark] storage.get error', e);
                return null;
            }
        },
        async set(obj) {                                                             // 同步写入接口
            try {                                                                    // 捕获全部异常
                if (chrome?.runtime?.id) {                                           // 确认扩展上下文有效
                    await chrome.storage.sync.set(obj);                              // 立即写入, 取消延迟
                } else {                                                             // 无效上下文
                    console.warn('[Bookmark] storage.set skipped: invalid context'); // 记录并跳过
                }
            } catch (e) {                                                            // 写入过程中异常
                if (e?.message?.includes('Extension context invalidated')) {         // 上下文丢失
                    console.warn('[Bookmark] storage.set skipped (context lost)', e);
                } else {                                                             // 其他错误
                    console.warn('[Bookmark] storage.set error', e);
                }
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
            id: 'cgpt-bookmarks-wrapper', style: 'width:100%;margin-bottom:4px'
        });
        const inner = Object.assign(document.createElement('div'), {style: 'padding:4px 0'});
        const bar = Object.assign(document.createElement('div'), {
            textContent: 'Groups', style: 'display:flex;align-items:center;font:bold 14px/1 white;padding:4px 12px'
        });
        const addBtn = Object.assign(document.createElement('span'), {
            textContent: '+', style: 'cursor:pointer;margin-left:auto;font-weight:bold'
        });
        addBtn.addEventListener('click', async () => {
            const n = prompt('group name');                                          // 弹窗获取组名
            if (!n || !n.trim()) return;                                             // 空输入直接返回
            const MAX_LEN = 20;                                                      // 设定组名最大字符数
            let name = n.trim();                                                     // 去除首尾空格
            if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN) + '…';          // 超长则截断并加省略号
            const id = 'f_' + Date.now();                                            // 生成唯一 id
            folders[id] = {name, chats: [], collapsed: false, prompt: ''};                     // 保存至数据结构
            await storage.set({folders});
            render();
        });
        bar.appendChild(addBtn);
        const folderZone = Object.assign(document.createElement('div'), {style: 'padding:0 12px'});
        inner.append(bar, folderZone);
        wrap.appendChild(inner);
        historyNode.parentElement.insertBefore(wrap, historyNode);                            // 插入侧栏顶部

        /* ---------- 数据读取 ---------- */
        folders = (await storage.get('folders')) || {};
        let _migrated = false;
        Object.values(folders).forEach(f => {
            if (!('prompt' in f)) {
                f.prompt = '';
                _migrated = true;
            }
        });
        if (_migrated) await storage.set({folders});

        /* ---------- 辅助函数 ---------- */
        const liveSyncMap = new Map();
        let activePath = null;
        let activeFid = null;
        let lastClickedChatEl = null;
        const debounce = (fn, wait = 120) => {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), wait);
            };
        };
        const syncTitles = debounce(() => {
            let updated = false;
            liveSyncMap.forEach((arr, path) => {
                const a = qs(`a[href*="${path}"]`, historyNode)
                if (!a) {  // 会话已被删除
                    arr.forEach(({fid}) => {
                        const folder = folders[fid];
                        if (!folder) return;
                        const before = folder.chats.length;
                        folder.chats = folder.chats.filter(c => !samePath(c.url, location.origin + path));
                        if (folder.chats.length !== before) updated = true;
                    });
                    return;
                }
                const t = (a.textContent || '新对话').trim();
                arr.forEach(({fid, el}) => {
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
            if (updated) storage.set({folders});
        }, 200);

        new MutationObserver(syncTitles).observe(historyNode, {childList: true, subtree: true, characterData: true});

        /* —— 检测 history 会话被删除后同步移除收藏夹中对应条目 —— */
        const historyCleanupObs = new MutationObserver(() => {
            const activePaths = new Set(qsa('div#history a[href*="/c/"]').map(a => new URL(a.href).pathname));
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
            if (changed) storage.set({folders});
        });
        historyCleanupObs.observe(historyNode, {childList: true, subtree: true});

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
            header.style.cssText = `position:relative;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;padding:4px 6px;background:${COLOR.bgLight};border-radius:4px`;
            const corner = document.createElement('div');
            corner.className = 'cgpt-folder-corner';
            corner.dataset.fid = fid;
            corner.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;border-top:12px solid transparent;border-right:12px solid transparent';
            header.append(corner);

            const arrow = document.createElement('span');
            arrow.textContent = f.collapsed ? '▶' : '▼';
            const lbl = document.createElement('span');
            lbl.textContent = f.name;
            lbl.style.cssText = 'flex:1;white-space:normal;word-break:break-all;line-height:1.25';
            const left = document.createElement('div');
            left.style.cssText = 'display:flex;gap:6px;flex:1;align-items:flex-start';
            left.append(arrow, lbl);

            const newBtn = Object.assign(document.createElement('a'), {              // 创建新建会话按钮
                href: 'javascript:void 0',                                           // 禁止默认跳转
            });                                                                       // 其余样式改为内联设置
            newBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;color:#e7d8c5;cursor:pointer;transition:background .15s'; // 基础外观同前
            newBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' + // 引入图一完整 SVG
                '<path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287Z"></path>' + '<path d="M18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708Z"></path>' + '<path d="M11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"></path>' + '</svg>';
            let hideTip;                                                             // 保存提示关闭函数
            newBtn.onmouseenter = () => {                                            // 鼠标进入时
                hideTip = tip(newBtn, 'New chat');                                   // 显示提示
                newBtn.style.background = 'rgba(255,255,255,.07)';                   // 背景改深色，呈图二效果
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
            header.append(left, newBtn, menuBtn);                                    // 插入标题栏

            menuBtn.onclick = e => {                                                 // 点击三点按钮触发
                e.stopPropagation();                                                 // 阻止冒泡避免折叠文件夹
                const old = document.getElementById('cgpt-folder-menu');             // 若已存在菜单先移除
                old && old.remove();                                                 // 保证单实例

                const rect = menuBtn.getBoundingClientRect();                        // 获取按钮绝对位置
                const menu = Object.assign(document.createElement('div'), {id: 'cgpt-folder-menu'}); // 新建菜单容器
                menu.style.cssText = 'position:fixed;z-index:2147483647;min-width:140px;padding:8px 0;border-radius:10px;background:#2b2521;box-shadow:0 4px 10px rgba(0,0,0,.2);font-size:14px;color:#e7d8c5'; // 菜单样式
                menu.innerHTML =
                    '<div id="f_prompt" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer">' +
                    '<span style="flex:1">Prompt</span></div>' +
                    '<div id="f_rename" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer">' +
                    '<span style="flex:1">Rename</span></div>' +
                    '<div id="f_delete" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer;color:#e66">' +
                    '<span style="flex:1">Delete</span></div>';

                document.body.appendChild(menu);                                     // 添加到页面
                menu.style.left = rect.right - menu.offsetWidth + 'px';              // 右对齐按钮
                menu.style.top = rect.bottom + 6 + 'px';                             // 位于按钮下方

                const closeMenu = () => menu.remove();                               // 关闭菜单函数
                setTimeout(() => document.addEventListener('click', closeMenu, {once: true}), 0); // 点击其他地方关闭

                menu.querySelector('#f_rename').onclick = async () => {              // Rename 逻辑
                    const n = prompt('rename group', folders[fid].name);                                // 弹窗输入
                    if (!n || !n.trim()) return;                                     // 空输入忽略
                    const MAX_LEN = 20;                                              // 最大字符数
                    let name = n.trim();                                             // 去首尾空格
                    if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN) + '…';  // 超长截断
                    folders[fid].name = name;                                        // 更新数据
                    await storage.set({folders});                                    // 同步存储
                    render();                                                        // 重新渲染
                    closeMenu();                                                     // 关闭菜单
                };

                // 修改后
                menu.querySelector('#f_prompt').onclick = () => {
                    const defaultPrompt = folders[fid]?.prompt || '';
                    const modal = document.createElement('div');
                    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2147483648';
                    const box = document.createElement('div');
                    box.style.cssText = 'background:#2b2521;padding:16px;border-radius:8px;max-width:400px;width:80%;box-shadow:0 4px 10px rgba(0,0,0,0.2)';
                    const ta = document.createElement('textarea');
                    ta.value = defaultPrompt;
                    ta.style.cssText = 'width:100%;height:100px;background:#1e1815;color:#e7d8c5;border:none;padding:8px;border-radius:4px;resize:vertical;font-size:14px;line-height:1.4';
                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'text-align:right;margin-top:10px';
                    const okBtn = document.createElement('button');
                    okBtn.textContent = '确定';
                    okBtn.style.cssText = 'margin-right:8px;cursor:pointer';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = '取消';
                    cancelBtn.style.cssText = 'cursor:pointer';
                    btnWrap.appendChild(okBtn);
                    btnWrap.appendChild(cancelBtn);
                    box.appendChild(ta);
                    box.appendChild(btnWrap);
                    modal.appendChild(box);
                    document.body.appendChild(modal);
                    okBtn.onclick = async () => {
                        folders[fid].prompt = ta.value.trim();
                        await storage.set({folders});
                        render();
                        closeMenu();
                        document.body.removeChild(modal);
                    };
                    cancelBtn.onclick = () => {
                        document.body.removeChild(modal);
                    };
                };


                menu.querySelector('#f_delete').onclick = async () => {              // Delete 逻辑
                    delete folders[fid];                                             // 删除该文件夹
                    await storage.set({folders});                                    // 同步存储
                    render();                                                        // 重新渲染
                    closeMenu();                                                     // 关闭菜单
                };
            };


            const ul = document.createElement('ul');
            ul.style.cssText = `list-style:none;padding-left:8px;margin:4px 0 0;${f.collapsed ? 'display:none' : ''}`;
            f.chats.forEach(c => renderChat(ul, fid, c));

            header.onclick = async () => {
                f.collapsed = !f.collapsed;
                await storage.set({folders});
                render();
            };


            // 新建聊天按钮点击事件处理器
            newBtn.onclick = e => {
                e.stopPropagation(); // 阻止事件冒泡，避免折叠文件夹
                activeFid = fid; // 设置当前激活文件夹 ID，确保后续只为该文件夹添加会话
                const prevPaths = new Set( // 记录点击前已有的会话路径
                    qsa('div#history a[href*="/c/"]')
                        .map(a => new URL(a.href).pathname)
                );
                history.pushState({}, '', '/'); // 跳转到根路径，触发新会话
                window.dispatchEvent(new Event('popstate')); // 手动触发路由更新
                const iv = setInterval(async () => { // 定时轮询检测新会话生成
                    if (activeFid !== fid) { // 如果当前活跃文件夹已变更
                        clearInterval(iv); // 停止此轮询
                        return; // 不继续处理
                    }
                    if (!location.pathname.startsWith('/c/')) return; // 尚未进入新会话则跳过
                    const path = location.pathname; // 获取当前会话路径
                    if (prevPaths.has(path)) return; // 如果路径在记录中，说明不是新会话
                    if (folders[fid]?.chats.some(c => samePath(c.url, location.origin + path))) return; // 已存在该会话则跳过
                    const anchor = qs(`div#history a[href$="${path}"]`); // 查找侧栏中的新会话链接
                    if (!anchor) return; // 链接尚未出现，继续轮询
                    const title = anchor.textContent.trim() || 'loading…'; // 获取会话标题
                    folders[fid].chats.unshift({ url: location.href, title }); // 插入到当前文件夹开头
                    await storage.set({ folders }); // 同步存储
                    render(); // 重新渲染侧栏
                    highlightActive(); // 高亮当前会话
                    clearInterval(iv); // 完成后停止轮询
                }, 300); // 每 300ms 检查一次
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
                const t = qsa('a[href*="/c/"]').find(a => samePath(a.href, url))?.textContent.trim() || '会话';
                f.chats.push({url, title: t});
                await storage.set({folders});
                const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(2)');
                const fidList = Object.keys(folders);
                const idx = fidList.indexOf(fid);
                const oldBox = folderZone.children[idx];
                const newBox = renderFolder(fid, folders[fid]);
                folderZone.replaceChild(newBox, oldBox);
            };

            box.append(header, ul);
            return box;
        }

        /* ---------- 聊天渲染 ---------- */
        function renderChat(parentUl, fid, chat) {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:2px 0';

            const link = document.createElement('a');                               // 创建超链接节点
            link.href = chat.url || 'javascript:void 0';                            // 设定目标地址
            link.textContent = chat.title;                                          // 填入标题文本
            link.dataset.url = chat.url || '';                                      // 记录 URL 备用，以便后续统一高亮
            link.style.cssText = 'flex:1;margin-right:4px;font-size:13px;color:#b2b2b2;text-decoration:none;border-radius:6px'; // 基础样式并预留圆角
            const active = chat.url && samePath(chat.url, location.href);           // 判断是否为当前激活会话
            if (active) {                                                           // 若为激活状态则立即高亮
                link.style.background = 'rgba(255,255,255,.07)';                    // 深色背景
                link.style.color = '#fff';                                          // 文字改为白色
            }
            link.onclick = e => {
                if (!chat.url) return;
                e.preventDefault();
                lastClickedChatEl = link;
                history.pushState({}, '', chat.url);
                window.dispatchEvent(new Event('popstate'));
            };

            const del = Object.assign(document.createElement('span'), {
                textContent: '✖', style: 'cursor:pointer;color:while'
            });
            del.onclick = async () => {
                folders[fid].chats = folders[fid].chats.filter(c => !samePath(c.url, chat.url));
                await storage.set({folders});
                render();
            };

            li.append(link, del);
            parentUl.appendChild(li);

            /* —— 建立多对一同步映射 —— */
            if (chat.url) {                                              // URL 字符串存在才继续
                let path;                                                // 用于保存解析后的 pathname
                try {                                                    // 兼容相对路径或含空格等情况
                    path = new URL(chat.url, location.origin).pathname;  // 提供 base，确保相对路径可解析
                } catch {                                                // 解析失败说明为非法 URL
                    path = null;                                         // 置空，后面直接跳过建立映射
                }
                if (path) {                                              // 仅当成功解析时才同步到 liveSyncMap
                    if (!liveSyncMap.has(path)) liveSyncMap.set(path, []); // 若无键则初始化
                    const arr = liveSyncMap.get(path);                   // 取出映射数组
                    if (!arr.some(item => item.el === link))             // 去重
                        arr.push({fid, el: link});                       // 建立 fid-DOM 映射
                }
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
        dragSrcObs.observe(historyNode, {childList: true, subtree: true});

        /* ---------- 移除压缩按钮 ---------- */
        new MutationObserver(() => qsa('path[d^="M316.9 18"]').forEach(p => p.closest('button')?.remove()))
            .observe(document.body, {childList: true, subtree: true});

        /* ---------- 输入尾部提示 ---------- */
        function appendSuffix() {
            const ed = qs('.ProseMirror');
            if (!ed) return;
            const SUFFIX = ''; // 定义尾缀常量
            const path = location.pathname;                                         // 当前会话路径
            const mapArr = liveSyncMap.get(path) || [];                             // 映射数组（可能为空）
            mapArr.filter(({el}) => document.contains(el));
// 过滤掉已删除的旧节点
// 取最后一个仍在 DOM 中的 fid
            const groupPrompt = activeFid ? (folders[activeFid].prompt || '').trim() : '';     // 对应 prompt
            qsa('p', ed).forEach((p, i, arr) => {
                const txt = p.innerText.trim();
                if ((txt === SUFFIX || (groupPrompt && txt === groupPrompt)) && i !== arr.length - 1) p.remove();
            });
            let last = ed.lastElementChild;
            if (groupPrompt && !(last && last.innerText.trim() === groupPrompt)) {  // 追加 prompt
                const gp = document.createElement('p');
                gp.textContent = groupPrompt;
                ed.appendChild(gp);
                last = gp;                                                          // 更新 last 指针
            }
            if (!(last && last.innerText.trim() === SUFFIX)) {                      // 追加全局尾缀
                const p = document.createElement('p');
                p.textContent = SUFFIX;
                ed.appendChild(p);
            }                                                   // 追加到编辑器
            ed.dispatchEvent(new Event('input', {bubbles: true}));               // 触发输入事件
        }

        function bindSend() {
            const ed = qs('.ProseMirror');
            const send = qs('#composer-submit-button');
            if (!ed || !send || send.dataset.hooked) return;
            send.dataset.hooked = 1;                                                   // 标记已挂钩避免重复

            const bumpActiveChat = () => {                                             // 把当前会话提至所在文件夹首位
                if (!location.pathname.startsWith('/c/')) return;                      // 非会话页面直接忽略
                const cur = location.href;                                             // 记录当前完整 URL
                for (const [, folder] of Object.entries(folders)) {                 // 遍历所有收藏夹
                    const i = folder.chats.findIndex(c => c.url && samePath(c.url, cur));// 查找当前会话索引
                    if (i > 0) {                                                       // 若存在且不在首位
                        const [chat] = folder.chats.splice(i, 1);                      // 从原位置取出
                        folder.chats.unshift(chat);                                    // 插入数组开头
                        storage.set({folders});                                        // 同步到 chrome.storage
                        render();                                                      // 立即重渲染侧栏
                        break;                                                         // 处理完即可退出循环
                    }
                }
            };

            // —— 修改后，排除“停止生成”状态 ——
            send.addEventListener('click', e => {
                // 如果当前按钮已变为“停止生成”，则不插入提示
                const label = send.getAttribute('aria-label') || send.innerText;
                if (label.toLowerCase().includes('stop')) return;
                appendSuffix();
                bumpActiveChat();
            }, {capture: true});

            // —— 修改后，回车同样排除“停止生成” ——
            ed.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const btn = qs('#composer-submit-button');
                    const label = btn.getAttribute('aria-label') || btn.innerText;
                    if (label.toLowerCase().includes('stop')) return;
                    appendSuffix();
                    bumpActiveChat();
                }
            }, {capture: true});
        }

        new MutationObserver(bindSend).observe(document.body, {childList: true, subtree: true});
        bindSend();

        render();
        const highlightActive = () => {                                         // 仅更新必要元素
            const path = location.pathname;                                     // 当前路径
            if (activePath) {                                             // 若已有旧路径
                const oldArr = liveSyncMap.get(activePath);               // 取出旧路径所有克隆
                if (oldArr) oldArr.forEach(({el}) => {                    // 逐个清除高亮
                    el.style.background = '';
                    el.style.color = '#b2b2b2';
                });
            }
            const arr = liveSyncMap.get(path);                            // 获取当前路径克隆
            if (arr && arr.length) arr.forEach(({el}) => {                // 为全部克隆加高亮
                el.style.background = 'rgba(255,255,255,.07)';
                el.style.color = '#fff';
            });
            activePath = path;
            /* ----------【修改后 ②】---------- */
            if (arr && arr.length) {
                if (lastClickedChatEl) {
                    const entry = arr.find(item => item.el === lastClickedChatEl);
                    activeFid = entry ? entry.fid : arr[arr.length - 1].fid;
                    lastClickedChatEl = null;
                } else {
                    activeFid = arr[arr.length - 1].fid;
                }
            }
            document.querySelectorAll('.cgpt-folder-corner').forEach(el => {
                el.style.borderTopColor = el.dataset.fid === activeFid ? '#fff' : 'transparent';
            });

        };
        highlightActive();                                                      // 初始渲染立即同步
        window.addEventListener('popstate', highlightActive);
    }
})();
