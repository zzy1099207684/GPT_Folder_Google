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

    function init() {
        // 每次 DOM 变动都直接扫整页，保证任何新建/替换节点都能注入复选框
        const apply = () => renderCheckboxes(document);

        apply();                              // 首次执行

        // 监听整页而不是单个节点，解决侧栏被 React 重建后观察器失效的问题
        const mo = new MutationObserver(apply);
        mo.observe(document.body, { childList: true, subtree: true });
        window.__cgptBatchDelete.cleanup = () => mo.disconnect();
        window.addEventListener('beforeunload', window.__cgptBatchDelete.cleanup);
    }



    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
