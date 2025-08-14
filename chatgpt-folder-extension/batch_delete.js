(() => {
    if (window.__cgptBatchDelete) return;
    window.__cgptBatchDelete = {};

    const STORAGE_KEY = 'historyMultiSelected';
    const rawSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const selected = new Set(Array.isArray(rawSaved) ? rawSaved.filter(h => h && h !== '#') : []);
    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));

    window.clearHistoryMultiSelected = function () {
        selected.clear();
        save();
    };

    window.addEventListener('beforeunload', () => {
        selected.clear();
        save();
    }, { passive: true });

    function renderCheckboxes(root) {
        const itemsRoot =
            (root && root.nodeType === 1 && root.matches?.('a.__menu-item[href*="/c/"]')) ? [root] : [];
        const items = [
            ...itemsRoot,
            ...(root.querySelectorAll?.('a.__menu-item[href*="/c/"]') || [])
        ];
        if (!items.length) return;

        items.forEach(item => {
            if (item.querySelector('input.history-checkbox')) return;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'history-checkbox';
            cb.style.cssText = 'margin-right:6px;accent-color:#10a37f;';
            cb.checked = selected.has(item.href);

            cb.addEventListener('click', e => e.stopPropagation());
            cb.addEventListener('change', () => {
                if (cb.checked) selected.add(item.href);
                else selected.delete(item.href);
                save();
            });

            item.prepend(cb);
        });
    }

    function init() {
        const observeRoot =
            document.querySelector('div#history') ||
            document.querySelector('nav[aria-label="Chat history"]') ||
            document.body;

        const ensureForNode = node => {
            if (!node || node.nodeType !== 1) return;
            renderCheckboxes(node);
        };

        ensureForNode(observeRoot);

        const mo = new MutationObserver(ms => {
            for (const m of ms) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(ensureForNode);
                }
                const t = m.target;
                if (t) {
                    if (t.nodeType === 1 && t.matches?.('a.__menu-item[href*="/c/"]')) {
                        renderCheckboxes(t);
                    } else if (t.nodeType === 3) {
                        const p = t.parentElement;
                        if (p && p.matches?.('a.__menu-item[href*="/c/"]')) renderCheckboxes(p);
                    }
                }
            }
        });

        mo.observe(observeRoot, { childList: true, subtree: true, characterData: true });

        window.__cgptBatchDelete.cleanup = () => mo.disconnect();
        window.addEventListener('beforeunload', window.__cgptBatchDelete.cleanup, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
