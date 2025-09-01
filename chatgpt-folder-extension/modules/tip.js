// 轻量提示气泡：window.tip(el, text) → 返回关闭函数
(() => {
    if (window.__cgptTipInstalled) return;
    window.__cgptTipInstalled = true;

    const TIP_ID = 'cgpt-tip-style';
    const TIP_CLASS = 'cgpt-tip';

    // 样式只注入一次
    if (!document.getElementById(TIP_ID)) {
        const s = document.createElement('style');
        s.id = TIP_ID;
        s.textContent =
            `.${TIP_CLASS}{position:fixed;z-index:2147483647;padding:6px 10px;border-radius:6px;font-size:12px;` +
            `background:#333;color:#fff;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.12);animation:fade .15s both}` +
            `@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1}}`;
        document.head.appendChild(s);
    }

    function removeAllTips() {
        document.querySelectorAll(`.${TIP_CLASS}`).forEach(n => n.remove());
    }

    window.tip = function tip(el, txt) {
        try { removeAllTips(); } catch {}
        const d = Object.assign(document.createElement('div'), {
            className: TIP_CLASS,
            innerText: txt || ''
        });
        // 多行与溢出处理
        d.style.whiteSpace = 'pre-wrap';
        d.style.wordBreak = 'break-word';
        d.style.maxWidth = '200px';
        document.body.appendChild(d);

        try {
            const r = el?.getBoundingClientRect?.();
            if (r) {
                d.style.left = `${r.left + r.width / 2 - d.offsetWidth / 2}px`;
                d.style.top = `${r.top - d.offsetHeight - 6}px`;
            } else {
                // 兜底：居中
                d.style.left = `${(window.innerWidth - d.offsetWidth) / 2}px`;
                d.style.top = `${(window.innerHeight - d.offsetHeight) / 2}px`;
            }
        } catch {}

        const timer = setTimeout(() => d.remove(), 3000);
        if (el && el.addEventListener) {
            el.addEventListener('mouseleave', () => { clearTimeout(timer); d.remove(); }, { once: true });
        }
        return () => { clearTimeout(timer); try { d.remove(); } catch {} };
    };

    // 页面关闭时清理
    window.addEventListener('pagehide', removeAllTips, { passive: true });
})();
