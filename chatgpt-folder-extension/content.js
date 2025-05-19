// content.js
(() => { // 立即执行函数隔离作用域
    // 单实例哨兵：若已存在则直接退出，防止重复执行
    if (window.__cgptBookmarksInstance) {
        console.warn('[Bookmark] Duplicate instance detected, aborting.');
        return;
    }
    window.__cgptBookmarksInstance = true;

    /* ===== 通用工具 ===== */
    function getDebugInfo() {
        return {
            observers: observers.list.length,
            mapSize: liveSyncMap.size,
            folderCount: Object.keys(folders).length,
            totalChats: Object.values(folders).reduce((sum, f) => sum + f.chats.length, 0),
            wrapperExists: !!qs('#cgpt-bookmarks-wrapper'),
            historyExists: !!qs('div#history')
        };
    }

    window.dumpFolderExtensionDebug = () => {
        console.table(getDebugInfo());
        return getDebugInfo();
    };

    /* ===== debounced save ===== */
    let _saveFoldersTimer = null;

    function scheduleSaveFolders(delay = 2000) {
        clearTimeout(_saveFoldersTimer);
        _saveFoldersTimer = setTimeout(async () => {
            try {
                if (chrome?.runtime?.id) {
                    // 同步写入 storage.sync，保证 collapsed 状态持久化
                    await storage.set({folders});
                    chrome.runtime.sendMessage({type: 'save-folders', data: folders});
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

// 关键场景下再检查一次，确保后续状态同步
    window.addEventListener('resize', restorePointerEvents, {passive: true});
    const tryRestoreLater = () => setTimeout(restorePointerEvents, 50);
    document.addEventListener('pointerup', tryRestoreLater, true);
    document.addEventListener('dragend', tryRestoreLater, true);
    new MutationObserver(restorePointerEvents)
        .observe(document.body, {attributes: true, attributeFilter: ['style']});
    /* ---------- 修复段结束 ---------- */
// 统一颜色常量
    const samePath = (a, b) => new URL(a, location.origin).pathname === new URL(b, location.origin).pathname; // 比较路径
    // 增强的选择器函数
    const qs = (sel, root = document) => {
        try {
            return root.querySelector(sel);
        } catch (e) {
            console.warn(`[Bookmark] Error querying selector "${sel}":`, e);
            return null;
        }
    };

    const qsa = (sel, root = document) => {
        try {
            return Array.from(root.querySelectorAll(sel));
        } catch (e) {
            console.warn(`[Bookmark] Error querying all selector "${sel}":`, e);
            return [];
        }
    };
    /* ===== 高效封装 storage ===== */
    // ① preset prompt and group
    const hints = [
        {
            label: 'NORMAL',
            text: '# Response specs below – DO NOT treat as question content：\n' +
                '```Pay attention to the reply style, and try your best to imitate Claude\'s style and thinking. Absolutely no horizontal lines(---,——,—,***) of any kind are allowed in the content.```'
        },
        {
            label: 'NO_GUESS',
            text: '# Response specs below – DO NOT treat as question content：\n' +
                '```Pay attention to the reply style, and try your best to imitate Claude\'s style and thinking. Only provide information that is explicitly and verifiably present in the provided content, regardless of its type. ' +
                'Any form of speculation, inference, assumption, extrapolation, analogy, or reasoning beyond the given facts is strictly and absolutely forbidden. ' +
                'Absolutely no horizontal lines(---,——,—,***) of any kind are allowed in the content.```'
        },
        {
            label: 'change_code',
            text: '# Response specs below – DO NOT treat as question content：\n' +
                '```Strictly adhere to the following requirements:\n' +
                'Except for the code that needs modification due to the raised question or requirement, do not modify any other unrelated code or functionality.\n' +
                'After the modification, you must first test it yourself and ensure the following two points are met:\n' +
                '1. The requirement is fulfilled, and the front-end and back-end functions run smoothly.\n' +
                '2. No other functional code has been mistakenly modified.\n' +
                '3. Ensure the code performance is stable and does not affect anything outside the intended scope.\n' +
                'Provide me with the source code of the part to be changed and the modified code, so I can compare and paste them myself.\n' +
                'Pay attention to the reply style, and try your best to imitate Claude\'s style and thinking. Absolutely no horizontal lines(---,——,—,***) of any kind are allowed in the content.```'
        },
        {
            label: 'CODE',
            text: '# Response specs below – DO NOT treat as question content：\n' +
                '```Pay attention to the reply style, and try your best to imitate Claude\'s style and thinking. ' +
                'Absolutely no horizontal lines(---,——,—,***) of any kind are allowed in the content. ' +
                'For any question or code request, only address the specific requirement. ' +
                'Do not change unrelated code or features. ' +
                'After changes, ensure the requirement is met, the program functions correctly, and other features remain unaffected. ' +
                'Show both original and modified code for comparison. ```'
        },
    ];         // 自行增删
    // 修改后的存储逻辑
    // Enhanced storage implementation with better error handling - replace storage object
    const storage = {
        _pendingWrites: {},
        _writeTimer: null,
        _writeDelay: 1000,
        _lastWriteTime: 0,
        _minInterval: 2000, // 最小写入间隔
        _retryCount: 0,
        _maxRetries: 3,
        _isRecovering: false,
        _maxPendingSize: 50, // 最大未处理条目数量

        async get(key) {
            try {
                if (!chrome?.runtime?.id) return null;          // 新增：上下文失效时短路
                const obj = await chrome.storage.sync.get(key); // 继续正常读取
                return obj[key];
            } catch (e) {
                console.warn('[Bookmark] storage.get error', e);
                return null;
            }
        },


        async set(obj) {
            try {
                if (!chrome?.runtime?.id) {
                    console.warn('[Bookmark] storage.set skipped: invalid context');
                    this._clearPendingWrites();
                    return;
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
                        } else if (e?.message?.includes('QUOTA_BYTES_PER_ITEM') || e?.message?.includes('QUOTA_BYTES')) {
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
                            prompt: (folder.prompt || '').slice(0, 100) // 限制提示长度
                        };
                    });

                    // 尝试直接写入精简版数据
                    setTimeout(async () => {
                        try {
                            await chrome.storage.sync.set({folders: minimalFolders});
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
    const TIP_ID = 'cgpt-tip-style';                                                           // 样式元素 id
    if (!document.getElementById(TIP_ID)) {                                                   // 若未注入则注入
        const s = document.createElement('style');                                            // 创建 style
        s.id = TIP_ID;                                                                        // 赋 id
        s.textContent = `.${CLS.tip}{position:fixed;z-index:2147483647;padding:6px 10px;border-radius:6px;font-size:12px;background:#333;color:#fff;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.12);animation:fade .15s both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1}}`;
        document.head.appendChild(s);                                                         // 注入
    }
    const tip = (el, txt) => {
        // 先清除页面上所有可能残留的气泡，避免重复或卡死
        document.querySelectorAll(`.${CLS.tip}`).forEach(node => node.remove());
        const d = Object.assign(document.createElement('div'), {className: CLS.tip, textContent: txt});
        document.body.appendChild(d);
        const r = el.getBoundingClientRect();
        d.style.left = r.left + r.width / 2 - d.offsetWidth / 2 + 'px';
        d.style.top = r.top - d.offsetHeight - 6 + 'px';
        // 安全保险：3 秒后自动销毁，防止意外卡死
        setTimeout(() => d.remove(), 3000);
        return () => d.remove();
    };


    /* ===== 全局数据 ===== */
    let folders = {};                                                                         // 收藏夹数据

    const readyObs = observers.add(new MutationObserver(() => {
        const hist = qs('div#history');

        const wrappers = qsa('#cgpt-bookmarks-wrapper');
        if (wrappers.length > 1) {
            wrappers.slice(1).forEach(w => w.remove());
        }

        const wrapper = wrappers[0];   // 可能为 undefined

        if (hist && wrapper && hist.parentElement && wrapper.parentElement !== hist.parentElement) {
            try {
                hist.parentElement.insertBefore(wrapper, hist);
            } catch (e) {
                console.warn('[Bookmark] Failed to relocate wrapper:', e);
            }
        }

        /* 新增：history 被折叠(==null)但旧 wrapper 仍在时，先彻底清理，等待重新初始化 */
        if (!hist && wrapper) {
            try {
                wrapper.remove();
            } catch {
            }
            if (window.__cgptBookmarksCleanup) {
                try {
                    window.__cgptBookmarksCleanup();
                } catch {
                }
            }
            return;            // 让下一次 observer 检测到 history 回来后再 init
        }

// ③ history 存在且 wrapper 不存在 → 重新初始化
        if (hist && !wrapper) {
            initBookmarks(hist);
        }

    }));
    readyObs.observe(document.body, {childList: true, subtree: true});


    /* ===== 初始化收藏夹 ===== */
    async function initBookmarks(historyNode) {
        /* ---------- 辅助函数 ---------- */
        const liveSyncMap = new Map();
        let currentNewChatObserver = null;
        let currentNewChatPopHandler = null;
// 【新增】点击 history 面板内任何 /c/ 会话，清除组选中标记
        const historyClickHandler = e => {
            const a = e.target.closest('a[href*="/c/"]');
            if (!a) return;
            clearActiveOnHistoryClick = true;
            lastClickedChatEl = null;
            const path = new URL(a.href, location.origin).pathname;
            lastActiveMap[path] = '__history__';
            try {
                if (chrome?.runtime?.id) {
                    storage.set({lastActiveMap});
                }
            } catch (err) {
                console.warn('[Bookmark] Error saving lastActiveMap:', err);
            }
            // 延迟到下一个事件循环，让 popstate 先触发，再更新高亮
            setTimeout(() => {
                highlightActive();
            }, 0);
        };

        historyNode._folderClickHandler = historyClickHandler; // 存储引用以便后续移除
        historyNode.addEventListener('click', historyClickHandler);

        if (qs('#cgpt-bookmarks-wrapper')) return;               // 防重复

        /* ---------- DOM 构建 ---------- */
        const wrap = Object.assign(document.createElement('div'), {
            id: 'cgpt-bookmarks-wrapper', style: 'width:100%;margin-bottom:4px'
        });
        const inner = Object.assign(document.createElement('div'), {style: 'padding:4px 0'});

        /* ---------- 新增：页面字体选择块 ---------- */
        const fontBlock = Object.assign(document.createElement('div'), {
            style: 'display:flex;align-items:center;padding:4px 12px 0'
        });
        const fontLabel = Object.assign(document.createElement('span'), {
            textContent: 'Font:',                          // 标签
            style: 'margin-right:8px;font-size:12px'
        });
        const fontSelect = Object.assign(document.createElement('select'), {
            style: [
                'flex:1',
                'font-size:12px',
                'padding:0 20px 0 0',
                'background-color:rgb(23,22,22)',
                'color:#fff',
                'border:none',
                'appearance:none',
                '-webkit-appearance:none',
                '-moz-appearance:none',
                'background-repeat:no-repeat',
                'background-position:right 8px center'
            ].join(';')
        });


        ['inherit', 'serif', 'SimSun', 'SimHei', 'Microsoft YaHei', 'Segoe UI', 'Arial'].forEach(f => {
            const o = document.createElement('option');
            o.value = f;
            o.textContent = f;
            fontSelect.appendChild(o);
        });
        fontSelect.addEventListener('change', e => {
            document.documentElement.style.fontFamily = e.target.value;
            if (chrome?.runtime?.id) storage.set({pageFont: e.target.value});
        });
        await (async () => {
            const saved = await storage.get('pageFont');
            if (saved) {
                fontSelect.value = saved;
                document.documentElement.style.fontFamily = saved;
            }
        })();
        fontBlock.append(fontLabel, fontSelect);
        /* ---------- 字体选择块结束 ---------- */

        const bar = Object.assign(document.createElement('div'), {
            textContent: 'Groups', style: 'display:flex;align-items:center;font:bold 14px/1 white;padding:4px 12px'
        });
        // 保留原有两行
        const addBtn = Object.assign(document.createElement('span'), {
            textContent: '+', style: 'cursor:pointer;margin-left:auto;font-weight:bold'
        });
        bar.appendChild(addBtn);

// 新增：点击“+”创建分组
        addBtn.addEventListener('click', () => {
            const raw = prompt('Group name', '');
            if (!raw) return;                      // 取消或空输入
            const name = raw.trim();
            if (!name) return;

            const fid = 'grp_' + Date.now().toString(36); // 生成简单唯一 ID
            folders[fid] = {                              // 初始化分组结构
                name: name.slice(0, 20) + (name.length > 20 ? '…' : ''),
                chats: [],
                collapsed: true,
                prompt: ''
            };

            const order = Object.keys(folders);           // 维持渲染顺序
            if (chrome?.runtime?.id) {
                storage.set({folders, folderOrder: order});
                chrome.runtime.sendMessage({type: 'save-folders', data: folders});
            }
            render();                                     // 刷新 UI
        });


        const folderZone = Object.assign(document.createElement('div'), {style: 'padding:0 12px'});
// …原 folderZone 事件监听保持不变…

        /* 关键：调整插入顺序——先字体块，再 Groups 标题，再分组列表 */
        inner.append(fontBlock, bar, folderZone);
        wrap.appendChild(inner);

        historyNode.parentElement.insertBefore(wrap, historyNode);                            // 插入侧栏顶部

        /* ---------- 数据读取 ---------- */
        const storedFolders = (await storage.get('folders')) || {};
        const storedOrder = (await storage.get('folderOrder')) || Object.keys(storedFolders);

// 若 storage 仍为空但全局 folders 已有内容(首次安装后立即缩小窗口)则回退到内存版本
        const baseFolders = Object.keys(storedFolders).length ? storedFolders : folders;
        const order = storedOrder.length ? storedOrder : Object.keys(baseFolders);

        folders = {};
        order.forEach(fid => {
            if (baseFolders[fid]) folders[fid] = baseFolders[fid];
        });

        const presetFlag = (await storage.get('presetInitialized')) || 0;
        if (presetFlag === 0) {
            for (let i = 0; i < 3; i++) {
                if (!Object.values(folders).some(f => f.name === hints[i].label)) {
                    const id = 'preset_' + hints[i].label;
                    folders[id] = {
                        name: hints[i].label,
                        chats: [],
                        collapsed: true,
                        prompt: hints[i].text
                    };
                    storedOrder.push(id);
                }
            }
            // 首次创建：同时写入初始化标记、folders 与排序
            storage.set({
                presetInitialized: 1,
                folders,
                folderOrder: storedOrder
            });
        } else {
            // 侧栏重新挂载时，确保本次内存里的 folders 与排序也同步持久化
            storage.set({
                folders,
                folderOrder: storedOrder
            });
        }
// 同步给后台脚本（原逻辑保留）
        chrome.runtime.sendMessage({type: 'save-folders', data: folders});


        let lastActiveMap = (await storage.get('lastActiveMap')) || {}; // 从 storage 读取路径到分组的映射，如果没有则初始化为空对象
        let _migrated = false; // 标记旧版本数据迁移逻辑
        Object.values(folders).forEach(f => {
            if (!('prompt' in f)) {
                f.prompt = '';
                _migrated = true;
            }
        });
        if (_migrated) chrome.runtime.sendMessage({type: 'save-folders', data: folders});


        // ========= 新增：当链接节点被移除时同步清理 =========
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


        // Enhanced cleanup function for liveSyncMap - replace existing function
        function cleanupLiveSyncMap() {
            try {
                // 如果Map过大，进行更激进的清理
                const aggressiveCleanup = liveSyncMap.size > 500;

                // 移除引用已不在DOM中的元素
                let cleaned = false;
                let totalRemoved = 0;

                // 如果映射为空，跳过清理
                if (liveSyncMap.size === 0) return false;

                // 优先检查最近未访问的路径
                const pathsToCheck = [...liveSyncMap.keys()];

                // 收集当前在DOM中的路径以提高性能
                const activePaths = new Set();
                try {
                    qsa('div#history a[href*="/c/"]').forEach(a => {
                        try {
                            activePaths.add(new URL(a.href, location.origin).pathname);
                        } catch (e) {
                        } // Silently ignore URL parsing errors
                    });
                } catch (e) {
                    console.warn('[Bookmark] Error collecting active paths:', e);
                }

                pathsToCheck.forEach((path) => {
                    if (!path) {
                        liveSyncMap.delete(path);
                        cleaned = true;
                        return;
                    }

                    // 如果路径不在当前历史中且进行激进清理，直接删除整个条目
                    const pathInHistory = activePaths.has(path);

                    if (aggressiveCleanup && !pathInHistory) {
                        const arr = liveSyncMap.get(path) || [];
                        totalRemoved += arr.length;
                        liveSyncMap.delete(path);
                        cleaned = true;
                        return;
                    }

                    // 否则过滤无效的DOM引用
                    const arr = liveSyncMap.get(path);
                    if (!arr || !Array.isArray(arr)) {
                        liveSyncMap.delete(path);
                        cleaned = true;
                        return;
                    }

                    const beforeLength = arr.length;

                    // 优化: 只检查在文档体中的元素
                    const newArr = arr.filter(({el}) => {
                        try {
                            return el && document.body.contains(el);
                        } catch (e) {
                            return false;
                        }
                    });

                    if (newArr.length === 0) {
                        liveSyncMap.delete(path);
                        totalRemoved += beforeLength;
                        cleaned = true;
                    } else if (newArr.length !== arr.length) {
                        liveSyncMap.set(path, newArr);
                        totalRemoved += (beforeLength - newArr.length);
                        cleaned = true;
                    }
                });

                if (cleaned && totalRemoved > 0) {
                    console.log(`[Bookmark] Cleaned ${totalRemoved} stale references from liveSyncMap`);
                }

                return cleaned; // 返回是否有清理发生
            } catch (err) {
                console.warn('[Bookmark] Error cleaning liveSyncMap:', err);
                return false;
            }
        }

// 增加更全面的清理策略 - 新增
        // Improve safety for deep memory cleaning - replace existing function
        function deepCleanMemory() {
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
// liveSyncMap 为空通常是侧栏被临时卸载的窗口状态, 此时跳过修剪以免误删映射
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
            }
        }

// 每3分钟做一次深度清理
        if (window.__deepCleanerId) clearInterval(window.__deepCleanerId);
        window.__deepCleanerId = setInterval(deepCleanMemory, 180000);
        let activePath = null;
        let activeFid = null;
        let lastClickedChatEl = null;
        const syncTitles = () => {
            let updated = false;
            liveSyncMap.forEach((arr, path) => {
                const a = qs(`a[href*="${path}"]`, historyNode);
                if (!a) {
                    arr.forEach(({fid}) => {
                        const folder = folders[fid];
                        if (!folder) return;
                        const before = folder.chats.length;
                        folder.chats = folder.chats.filter(c => !samePath(c.url, location.origin + path));
                        if (folder.chats.length !== before) updated = true;
                    });
                    return;
                }
                const t = (a.textContent || 'new chat').trim();
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
            if (updated) {                                               // 如果有标题或删除变更
                chrome.runtime.sendMessage({type: 'save-folders', data: folders}); // 同步存储最新数据
                render();                                                // 重新渲染所有分组及其会话列表
                highlightActive();                                       // 保持当前会话高亮状态不变
            }
        };


        observers.add(new MutationObserver(syncTitles)).observe(historyNode, {
            childList: true,
            subtree: true,
            characterData: true
        });

        let prevHistoryPaths = new Set(qsa('div#history a[href*="/c/"]').map(a => new URL(a.href).pathname));
        /* —— 检测 history 会话被删除后同步移除收藏夹中对应条目 —— */
        // 修改后的代码
        let historyCleanupDebouncer = null;
        const historyCleanupObs = observers.add(new MutationObserver(() => {
            // 添加防抖，避免短时间内多次触发
            clearTimeout(historyCleanupDebouncer);
            historyCleanupDebouncer = setTimeout(() => {
                try {
                    const anchors = qsa('div#history a[href*="/c/"]');
                    const currentPaths = new Set(anchors.map(a => new URL(a.href).pathname));

                    // 如果路径集合没有变化，跳过处理
                    if (prevHistoryPaths.size === currentPaths.size &&
                        [...prevHistoryPaths].every(path => currentPaths.has(path))) {
                        return;
                    }

                    // 原有删除同步逻辑
                    const activePaths = currentPaths;
                    let changed = false;
                    const folderZone = qs('#cgpt-bookmarks-wrapper > div > div:nth-child(3)');

                    if (!folderZone) return; // 安全检查

                    const fidList = Object.keys(folders);
                    for (const [fid, folder] of Object.entries(folders)) {
                        const oldChats = folder.chats;
                        const newChats = oldChats.filter(c => {
                            if (!c.url) return true;
                            try {
                                return activePaths.has(new URL(c.url).pathname);
                            } catch {
                                return true;
                            }
                        });
                        if (newChats.length !== oldChats.length) {
                            folder.chats = newChats;
                            changed = true;
                            const idx = fidList.indexOf(fid);
                            const oldBox = folderZone.children[idx];
                            if (oldBox) { // 安全检查
                                const newBox = renderFolder(fid, folder);
                                folderZone.replaceChild(newBox, oldBox);
                            }
                        }
                    }
                    if (changed) chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                    prevHistoryPaths = currentPaths;
                } catch (err) {
                    console.warn('[Bookmark] History cleanup error:', err);
                }
            }, 300); // 300ms 防抖
        }));


        historyCleanupObs.observe(historyNode, {childList: true, subtree: true});

        // ========= 新增：监听节点移除事件 =========
        const linkDetachObs = observers.add(new MutationObserver(muts => {
            muts.forEach(m => {
                m.removedNodes.forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (n.matches?.('a[data-url]')) detachLink(n);
                    n.querySelectorAll?.('a[data-url]').forEach(detachLink);
                });
            });
        }));
        linkDetachObs.observe(document.body, {childList: true, subtree: true});


        /* ---------- 渲染 ---------- */

        // Add after renderChat function, in the render() function
        function render() {
            // —— 新增：对所有路径剔除已断开节点 ——
            for (const [path, arr] of liveSyncMap) {
                const live = arr.filter(item => item.el.isConnected);
                live.length ? liveSyncMap.set(path, live) : liveSyncMap.delete(path);
            }

            folderZone.replaceChildren();
            Object.entries(folders)
                .forEach(([id, f]) => folderZone.appendChild(renderFolder(id, f)));

            // 添加定期清理，避免引用堆积
            if (Math.random() < 0.2) {
                setTimeout(cleanupLiveSyncMap, 0);
            }
        }


        /* ---------- 文件夹渲染 ---------- */
        function renderFolder(fid, f) {
            const box = document.createElement('div');
            box.style.marginTop = '4px';
            const header = document.createElement('div');
            header.style.cssText = `position:relative;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;padding:4px 6px;background:${COLOR.bgLight};border-radius:6px`;
            const corner = document.createElement('div');
            corner.className = 'cgpt-folder-corner';
            corner.dataset.fid = fid;

            corner.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;border-top:12px solid transparent;border-right:12px solid transparent';
            header.append(corner);

            const arrow = document.createElement('span');
            arrow.textContent = f.collapsed ? '∴' : '∵';
            const lbl = document.createElement('span');
            lbl.textContent = f.name;
            lbl.style.cssText = 'flex:1;white-space:normal;word-break:break-all;line-height:1.25';
            const left = document.createElement('div');
            left.style.cssText = 'display:flex;gap:6px;flex:1;align-items:flex-start';
            left.append(arrow, lbl);

            const newBtn = Object.assign(document.createElement('a'), {              // 创建新建会话按钮
                href: 'javascript:void 0',                                           // 禁止默认跳转
            });                                                                       // 其余样式改为内联设置
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
                menu.innerHTML = `
        <div class="f-item" data-act="prompt" style="padding:6px 16px;cursor:pointer">Prompt</div>
        <div class="f-item" data-act="rename" style="padding:6px 16px;cursor:pointer">Rename</div>
        <div class="f-item" data-act="delete" style="padding:6px 16px;cursor:pointer;color:#e66">Delete</div>`;
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
                            const t = n.trim().slice(0, 20) + (n.trim().length > 20 ? '…' : '');
                            folders[fid].name = t;
                            chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                            render();
                        }
                        close();
                    }

                    if (act === 'delete') {                       // 删除
                        if (confirm('sure delete this group?')) {
                            delete folders[fid];
                            chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                            render();
                        }
                        close();
                    }

                    if (act === 'prompt') {                       // 设置 prompt
                        const modal = document.createElement('div');
                        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483648';
                        const box = document.createElement('div');
                        box.style.cssText = 'background:#2b2521;padding:16px;border-radius:6px;max-width:400px;width:80%';
                        const ta = document.createElement('textarea');
                        ta.value = folders[fid].prompt || '';
                        ta.style.cssText = 'width:100%;height:100px;background:#1e1815;color:#e7d8c5;border:none;padding:8px;border-radius:6px;resize:vertical';

                        // ① 预设提示词
                        const hintBar = document.createElement('div');
                        hintBar.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap';
                        hints.forEach(h => {
                            const btn = document.createElement('span');
                            btn.textContent = h.label;
                            btn.style.cssText = 'cursor:pointer;padding:2px 4px;border:1px solid #555;border-radius:12px;font-size:12px;position:relative;top:-2px';
                            btn.onclick = () => {
                                ta.focus();
                                const {selectionStart: s, selectionEnd: e} = ta;
                                ta.setRangeText(h.text, s, e, 'end');
                                ta.dispatchEvent(new Event('input', {bubbles: true}));
                            };
                            hintBar.appendChild(btn);
                        });
                        box.append(ta, hintBar);            // ② 把快捷栏放在 textarea 下

                        const ok = document.createElement('button');
                        ok.textContent = '确定';
                        ok.style.cssText = 'margin-right:8px';
                        const cancel = document.createElement('button');
                        cancel.textContent = '取消';
                        const wrap = document.createElement('div');
                        wrap.style.cssText = 'text-align:right;margin-top:10px';
                        wrap.append(ok, cancel);
                        box.append(ta, wrap);
                        modal.appendChild(box);
                        document.body.appendChild(modal);

                        ok.onclick = () => {
                            folders[fid].prompt = ta.value.trim();
                            chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                            render();
                            document.body.removeChild(modal);
                        };
                        cancel.onclick = () => document.body.removeChild(modal);
                        close();
                    }
                });
            });

            /* ===== 修改后片段 1 ===== */
            newBtn.onclick = e => {
                e.stopPropagation();

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
                        }

                    } catch (err) {
                        console.warn('[Bookmark] Fallback popstate handler error:', err);
                    }
                };
                window.addEventListener('popstate', popHandler, {once: false});
                currentNewChatPopHandler = popHandler;
                /* ==== 兜底结束 ==== */

                const prevPaths = new Set(
                    qsa('div#history a[href*="/c/"]').map(a => new URL(a.href).pathname)
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


                // 定义observer - 监视history区域变化以检测新聊天
                const observer = new MutationObserver(() => {
                    if (token !== window.__cgptPendingToken) return;
                    const anchors = qsa('div#history a[href*="/c/"]');

                    // 当前路径集合
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
                    const newPaths = [...currentPaths].filter(p => !prevPaths.has(p));
                    if (!newPaths.length) return;

                    /* ===== 修改后片段 2 ===== */
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
                    const title = (newChatAnchor?.textContent || 'new chat').trim();

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
                            chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                            render();               // 重新渲染以建立 liveSyncMap
                        }

                        highlightActive();          // 更新高亮，保持白角标
                    } catch (err) {
                        console.warn('[Bookmark] Error processing new chat metadata:', err);
                    }

                });

                observer.observe(qs('div#history'), {childList: true, subtree: true});
                currentNewChatObserver = observer;
            };


            const ul = document.createElement('ul');
            ul.style.cssText = `list-style:none;padding-left:8px;margin:4px 0 0;${f.collapsed ? 'display:none' : ''}`;
            f.chats.forEach(c => renderChat(ul, fid, c));

            header.onclick = () => {
                f.collapsed = !f.collapsed;          // 更新本地状态
                scheduleSaveFolders();               // 通过节流函数延迟写入
                render();
                highlightActive();
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
                f.chats.unshift({url, title: t}); // 插入到数组开头
                chrome.runtime.sendMessage({type: 'save-folders', data: folders});
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
            header.dataset.idx = idx;
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
                window.__cgptPendingFid = null;
                window.__cgptPendingToken = null;
                clearActiveOnHistoryClick = false;
                if (!chat.url) return;
                e.preventDefault();
                lastClickedChatEl = link;
                const path = new URL(chat.url, location.origin).pathname;
                lastActiveMap[path] = fid;
                try {
                    if (chrome?.runtime?.id) {
                        storage.set({lastActiveMap});
                    }
                } catch (err) {
                    console.warn('[Bookmark] Error saving lastActiveMap:', err);
                }
                history.pushState({}, '', chat.url);
                window.dispatchEvent(new Event('popstate'));
                setTimeout(() => {
                    if (lastClickedChatEl === link) {
                        lastClickedChatEl = null;
                    }
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
                    // 同步存储并重新渲染
                    chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                    render();
                }
            };
            li.append(link, del);


            parentUl.appendChild(li);


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
        const dragSrcObs = observers.add(new MutationObserver(() => {
            qsa('a[href*="/c/"]').forEach(a => {
                if (a.dataset.drag) return;
                a.dataset.drag = 1;
                a.draggable = true;
                a.ondragstart = e => e.dataTransfer.setData('text/plain', a.href);
            });
        }));
        dragSrcObs.observe(historyNode, {childList: true, subtree: true});

        /* ---------- 移除压缩按钮 ---------- */
        observers.add(new MutationObserver(() => qsa('path[d^="M316.9 18"]').forEach(p => p.closest('button')?.remove())))
            .observe(document.body, {childList: true, subtree: true});

        /* ---------- 输入尾部提示 ---------- */
        function appendSuffix() {
            // 若是从 history 面板点击进入，清除本次标记，不插入任何提示
            if (clearActiveOnHistoryClick) {
                clearActiveOnHistoryClick = false;
                return;
            }

            const ed = qs('.ProseMirror');
            if (!ed) return;
            const SUFFIX = ''; // 定义尾缀常量
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

            const groupPrompt = currentFid ? (folders[currentFid].prompt || '').trim() : '';

            qsa('p', ed).forEach((p, i, arr) => {
                const txt = p.innerText.trim();
                if ((txt === SUFFIX || (groupPrompt && txt === groupPrompt)) && i !== arr.length - 1) p.remove();
            });
            let last = ed.lastElementChild;
            if (groupPrompt && !(last && last.innerText.trim() === groupPrompt)) {
                const blank = document.createElement('p');       // 创建空段落
                blank.innerHTML = '<br>';                        // 使用换行填充
                ed.appendChild(blank);                           // 插入空行

                const gp = document.createElement('p');          // 创建提示词段落
                gp.textContent = groupPrompt;                    // 设置内容
                ed.appendChild(gp);                              // 插入提示词
                last = gp;
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

            // 修改后版本：新增 i === -1 时插入逻辑，只对 activeFid 生效
            const bumpActiveChat = () => {
                if (!location.pathname.startsWith('/c/')) return;
                const cur = location.href;
                // 优先从 history 里取标题，取不到就用“new chat”
                const title = qs(`div#history a[href*="${cur}"]`)?.textContent.trim() || 'new chat';
                const curPath = new URL(cur).pathname;

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
                if (hasPendingUpload(ed)) {
                    const id = setInterval(() => {
                        if (!hasPendingUpload(ed)) {
                            clearInterval(id);
                            appendSuffix();
                        }
                    }, 500);
                }

                const folder = folderFid ? folders[folderFid] : null;
                if (!folder) return;
                if (folderFid && !lastActiveMap[curPath]) {
                    lastActiveMap[curPath] = folderFid;
                    if (chrome?.runtime?.id) storage.set({lastActiveMap});
                }
                const i = folder.chats.findIndex(c => samePath(c.url, cur));
                if (i >= 0) {
                    const [chat] = folder.chats.splice(i, 1);
                    folder.chats.unshift(chat);
                } else {
                    folder.chats.unshift({url: cur, title});
                }
                chrome.runtime.sendMessage({type: 'save-folders', data: folders});
                render();
                highlightActive();
                if (window.__cgptPendingFid === folderFid) {
                    window.__cgptPendingFid = null;
                    window.__cgptPendingToken = null;
                }
            };


            // —— 修改后，排除“停止生成”状态 ——
            // 新增：判断编辑器内是否仍有待上传的附件
            function hasPendingUpload(edNode) {
                return !!edNode && edNode.querySelector(
                    'img,figure,video,[data-testid="file-attachment"],[data-testid="image-attachment"]'
                );
            }

// ① 发送按钮点击（修改）
            send.addEventListener('click', () => {
                const label = send.getAttribute('aria-label') || send.innerText;
                if (label.toLowerCase().includes('stop')) return;
                const pending = hasPendingUpload(ed);
                if (!pending) appendSuffix();
                bumpActiveChat();
            }, {capture: true});

// ② 回车快捷发送（修改）
            ed.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const btn = qs('#composer-submit-button');
                    if (!btn) return;
                    const label = btn.getAttribute('aria-label') || btn.innerText;
                    if (label.toLowerCase().includes('stop')) return;
                    const pending = hasPendingUpload(ed);
                    if (!pending) appendSuffix();
                    bumpActiveChat();
                }
            }, {capture: true});


        }

        observers.add(new MutationObserver(bindSend)).observe(document.body, {childList: true, subtree: true});
        bindSend();

        render();
        let clearActiveOnHistoryClick = false;

        // clearGroupHighlight 修正版
        const clearGroupHighlight = () => {
            clearActiveOnHistoryClick = true;
            activeFid = null;

            // 移除根路径与分组的映射，阻止伪高亮复活
            if (lastActiveMap && lastActiveMap['/']) {
                delete lastActiveMap['/'];
                try {
                    if (chrome?.runtime?.id) storage.set({ lastActiveMap });
                } catch (err) {
                    console.warn('[Bookmark] Error clearing root mapping:', err);
                }
            }

            // 清空挂起标记，防止后续误判
            window.__cgptPendingFid = null;
            window.__cgptPendingToken = null;

            setTimeout(highlightActive, 0);
        };


        historyNode.addEventListener('click', e => {
            const a = e.target.closest('a[href*="/c/"]');
            if (!a) return;
            lastClickedChatEl = null;
            const path = new URL(a.href, location.origin).pathname;
            lastActiveMap[path] = '__history__';
            try {
                if (chrome?.runtime?.id) {
                    storage.set({lastActiveMap});
                }
            } catch (err) {
                console.warn('[Bookmark] Error saving lastActiveMap:', err);
            }
            setTimeout(highlightActive, 0);
        });

        // 全局 New chat 事件委托，兼容按钮被反复卸载/重建
        if (!window.__cgptGlobalNewHooked) {
            window.__cgptGlobalNewHooked = true;
            const selector = '[data-testid="create-new-chat-button"]';
            document.addEventListener('click', e => {
                const btn = e.target.closest(selector);
                if (!btn) return;

                // 若由组内 newBtn 间接触发，则仅复位标志，保留组高亮
                if (window.__cgptSuppressGroupClear) {
                    window.__cgptSuppressGroupClear = false;
                    return;
                }
                clearGroupHighlight();
            }, true);           // 捕获阶段，先于 ChatGPT 自身逻辑执行
        }


        const highlightActive = () => {
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
                const isHistoryView = lastActiveMap[path] === '__history__';
                arr.forEach(({el}) => {
                    const inHistory = !!el.closest('#history');
                    if (isHistoryView && !inHistory) {
                        el.style.background = '';
                        el.style.color = '#b2b2b2';
                    } else {
                        el.style.background = 'rgba(255,255,255,.07)';
                        el.style.color = '#fff';
                    }
                });
            }
            activePath = path;

            /* 新增：优先根据刚刚点击的具体链接确定选中组，彻底消除同一会话跨组错标 */
            let storedFid = lastActiveMap[path];
            if (!storedFid && lastClickedChatEl) {
                const hit = arr?.find(i => i.el === lastClickedChatEl);
                storedFid = hit?.fid;
            }

            if (storedFid === '__history__') {
                activeFid = null;                                 // 历史面板点击：清除高亮
            } else if (storedFid && folders[storedFid]) {
                activeFid = storedFid;                            // 始终信任映射表
            } else if (arr && arr.length && !clearActiveOnHistoryClick) {
                for (const [fid, folder] of Object.entries(folders)) {
                    if (folder.chats.some(c => samePath(c.url, location.origin + path))) {
                        activeFid = fid;
                        break;
                    }
                }
            }


            document.querySelectorAll('.cgpt-folder-corner').forEach(el => {
                el.style.borderTopColor = el.dataset.fid === activeFid ? '#fff' : 'transparent';
            });
        };


        highlightActive();                                                      // 初始渲染立即同步
        window.addEventListener('popstate', highlightActive);

        function checkMemoryUsage() {
            try {

                // 检测已知的内存泄漏指标
                cleanupLiveSyncMap();
                const mapSize = liveSyncMap.size;
                const observerCount = observers.list.length;

                // 检查DOM是否存在异常
                const wrapperExists = !!qs('#cgpt-bookmarks-wrapper');
                const historyExists = !!qs('div#history');

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

                // 如果有明显异常 (地图过大或DOM不一致或太多无效引用)
                if (mapSize > 1000 || (significantLeak && invalidRatio > 0.3) ||
                    (wrapperExists && !historyExists) ||
                    (!wrapperExists && historyExists)) {
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
                    if (mapSize > 2000 || invalidRatio > 0.5 || ((wrapperExists && !historyExists) && document.readyState === 'complete')) {
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
                        const hist = qs('div#history');
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

        // 每2分钟检查一次内存状态
        if (window.__memoryCheckerId) clearInterval(window.__memoryCheckerId);
        window.__memoryCheckerId = setInterval(checkMemoryUsage, 120000);
        // 正确创建cleanup函数
        // Enhanced cleanup function - replace existing cleanup function
        const cleanup = () => {
            // 清理所有观察器
            try {
                observers.disconnectAll();
            } catch (e) {
                console.warn('[Bookmark] Error disconnecting observers:', e);
            }

            // 清理定时器
            try {
                if (typeof liveSyncCleanerId !== 'undefined') clearInterval(liveSyncCleanerId);
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
                const hist = qs('div#history');
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
                    delete historyNode._hasFolderListeners;
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
        };

        // 页面卸载时清理资源
        window.addEventListener('beforeunload', cleanup);

        // 在动态内容页面可能发生的导航事件上添加清理
        document.addEventListener('spa:navigation', cleanup);
    }
})();