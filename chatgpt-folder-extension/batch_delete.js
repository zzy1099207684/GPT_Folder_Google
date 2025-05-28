// multiSelectHistory.js
(() => {
    const STORAGE_KEY = 'historyMultiSelected';
    const rawSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const selected = new Set(
        Array.isArray(rawSaved) ? rawSaved.filter(h => h && h !== '#') : []
    );

    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));

    /** 在指定容器内为尚未处理过的会话条目注入复选框 */
    function renderCheckboxes(root) {
        const items = root.querySelectorAll(
            'a.__menu-item[href*="/c/"]:not([data-checkbox-ready])'
        );
        items.forEach(item => {
            item.dataset.checkboxReady = '1';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'history-checkbox';
            cb.style.cssText = 'margin-right:6px;accent-color:#10a37f;';  // 绿色勾选+正常对勾
            cb.checked = selected.has(item.href);

            cb.addEventListener('click', e => e.stopPropagation());

// 仅在状态变化时同步本地存储
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selected.add(item.href);
                } else {
                    selected.delete(item.href);
                }
                save();
            });

            item.prepend(cb);               // 插入到标题文本前
        });
    }

    /** 初始化并监听后续 DOM 变化 */
    function init() {
        const historyRoot =
            document.querySelector('nav[aria-label="Chat history"]') || // 侧边栏主历史:contentReference[oaicite:1]{index=1}
            document.getElementById('history');                         // 旧版/移动端备用:contentReference[oaicite:2]{index=2}

        if (!historyRoot) return;

        renderCheckboxes(historyRoot);

        // ChatGPT 侧边栏会频繁重渲染；用 MutationObserver 自动补齐新节点
        const mo = new MutationObserver(() => renderCheckboxes(historyRoot));
        mo.observe(historyRoot, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
