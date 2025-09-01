// 修复页面偶发 pointer-events: none；放行可编辑区的复制/剪切/粘贴/右键
(() => {
    if (window.__cgptInputSafetyInstalled) return;
    window.__cgptInputSafetyInstalled = true;

    function isBlockingOverlayExist() {
        return !!document.querySelector(
            '[data-state="open"][role="dialog"],' +
            '.fixed.inset-0[data-aria-hidden="true"],' +
            '.immersive-translate-modal[style*="display: flex"]'
        );
    }
    function restorePointerEvents() {
        const b = document.body;
        if (b && b.style.pointerEvents === 'none' && !isBlockingOverlayExist()) {
            b.style.pointerEvents = '';
        }
    }

    const allowClipboard = (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const editable =
            t.matches('input,textarea,[contenteditable="true"]') ||
            t.closest('[role="dialog"] input,[role="dialog"] textarea,[role="dialog"] [contenteditable="true"]');
        if (editable) e.stopPropagation();
    };

    const onResize = () => restorePointerEvents();
    const tryRestoreLater = () => setTimeout(restorePointerEvents, 50);
    const onPointerUp = () => tryRestoreLater();
    const onDragEnd = () => tryRestoreLater();

    // 初始恢复
    requestAnimationFrame(restorePointerEvents);

    // 事件挂载（捕获阶段放行剪贴板）
    window.addEventListener('copy', allowClipboard, true);
    window.addEventListener('cut', allowClipboard, true);
    window.addEventListener('paste', allowClipboard, true);
    window.addEventListener('contextmenu', allowClipboard, true);
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('dragend', onDragEnd, true);

    // 观察 body 的 style 变更以即时恢复
    const mo = new MutationObserver(restorePointerEvents);
    const startMO = () => mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    if (document.body) startMO();
    else window.addEventListener('DOMContentLoaded', startMO, { once: true, passive: true });

    // 卸载清理
    window.addEventListener('pagehide', () => {
        try {
            window.removeEventListener('copy', allowClipboard, true);
            window.removeEventListener('cut', allowClipboard, true);
            window.removeEventListener('paste', allowClipboard, true);
            window.removeEventListener('contextmenu', allowClipboard, true);
            window.removeEventListener('resize', onResize, { passive: true });
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('dragend', onDragEnd, true);
            mo.disconnect();
        } catch {}
    }, { passive: true });
})();
