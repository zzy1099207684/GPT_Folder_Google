// 让输入框附件条显示可见的横向滚动条
(() => {
    if (window.cgptAttachStrip) return;

    const STYLE_ID = 'cgpt-attach-scroll-style';
    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
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
form[data-type="unified-composer"] .cgpt-attach-strip::-webkit-scrollbar-track{background:transparent}`;
        document.head.appendChild(s);
    }

    function apply() {
        ensureStyle();
        const strip = document.querySelector('form[data-type="unified-composer"] .horizontal-scroll-fade-mask');
        if (strip && !strip.classList.contains('cgpt-attach-strip')) {
            strip.classList.remove('no-scrollbar');
            strip.classList.add('cgpt-attach-strip');
        }
    }

    let mo = null;
    function enable() {
        apply();
        if (!mo) {
            mo = new MutationObserver(apply);
            try { mo.observe(document.body, { childList: true, subtree: true }); } catch {}
        }
    }
    function disable() { try { mo?.disconnect(); mo = null; } catch {} }

    window.cgptAttachStrip = { enable, disable };
    window.addEventListener('pagehide', disable, { passive: true });
})();
