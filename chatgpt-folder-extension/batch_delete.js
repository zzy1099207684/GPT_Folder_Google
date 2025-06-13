// multiSelectHistory.js
(() => {
    if (window.__cgptBatchDelete) {
        return;
    }
    window.__cgptBatchDelete = {};
    const STORAGE_KEY = 'historyMultiSelected';
    const rawSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const selected = new Set(
        Array.isArray(rawSaved) ? rawSaved.filter(h => h && h !== '#') : []
    );

    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));

    // 对外暴露清空方法，供分组逻辑调用
    window.clearHistoryMultiSelected = function () {
        selected.clear();
        save();
    };

    // 页面即将卸载时同步清空，避免刷新后仍处于选中
    window.addEventListener('beforeunload', () => {
        selected.clear();
        save();
    });

    /** 在指定容器内为尚未处理过的会话条目注入复选框 */
    function renderCheckboxes(root) {
        const itemsRoot = (root.nodeType === 1 &&
            root.matches('a.__menu-item[href*="/c/"]:not([data-checkbox-ready])'))
            ? [root] : [];
        const items = [
            ...itemsRoot,
            ...root.querySelectorAll?.('a.__menu-item[href*="/c/"]:not([data-checkbox-ready])') || []
        ];
        if (!items.length) return;
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

    function init() {

        const observeRoot = document.querySelector('div#history')
            || document.querySelector('nav[aria-label="Chat history"]')
            || document.body;

        const handleAdded = node => {
            if (node.nodeType !== 1) return;
            if (node.matches?.('a.__menu-item[href*="/c/"]')) renderCheckboxes(node);
            node.querySelectorAll?.('a.__menu-item[href*="/c/"]').forEach(renderCheckboxes);
        };

        handleAdded(observeRoot);

        const mo = new MutationObserver(ms => {
            ms.forEach(m => m.addedNodes.forEach(handleAdded));
        });
        mo.observe(observeRoot, { childList: true, subtree: true });
        window.__cgptBatchDelete.cleanup = () => mo.disconnect();
        window.addEventListener('beforeunload', window.__cgptBatchDelete.cleanup, {passive: true});
    }



    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
