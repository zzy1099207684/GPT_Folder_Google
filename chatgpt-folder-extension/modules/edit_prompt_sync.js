// 编辑面板发送前，把首个※…※区块同步为当前选中 Prompt
(() => {
    if (window.__cgptEditPromptSyncInstalled) return;
    window.__cgptEditPromptSyncInstalled = true;

    function readCurrentPromptText() {
        try {
            const raw = sessionStorage.getItem('cgptSessionPrompt');
            const obj = raw ? JSON.parse(raw) : null;
            const t = obj && typeof obj.text === 'string' ? obj.text.trim() : null;
            return t && t.length ? t : null;
        } catch { return null; }
    }
    function isLikelySend(btn) {
        if (!btn) return false;
        if (btn.id === 'composer-submit-button') return false; // 排除主输入框发送
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return /(send|提交|保存|确定)/.test(label);
    }
    function findEditContainer(start) {
        let n = start, hop = 0;
        while (n && hop < 10) {
            if (n.querySelector && n.querySelector('textarea,[contenteditable="true"]')) return n;
            n = n.parentElement;
            hop++;
        }
        return null;
    }
    function readPromptOptions() {
        try {
            if (Array.isArray(window.__cgptPromptOptions)) return window.__cgptPromptOptions;
            const raw = sessionStorage.getItem('cgptPromptOptions');
            const arr = raw ? JSON.parse(raw) : null;
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }
    const stripMarkers = (s) => String(s || '').replace(/^※/, '').replace(/※$/, '');
    document.addEventListener('click', function (ev) {
        const btn = ev.target && ev.target.closest('button,[role="button"]');
        if (!isLikelySend(btn)) return;

        const box = findEditContainer(btn);
        if (!box) return;

        const editor = box.querySelector('textarea,[contenteditable="true"]');
        if (!editor || editor.id === 'prompt-textarea') return;

        const selected = readCurrentPromptText();
        if (!selected) return;

        const getText = (el) => el.tagName === 'TEXTAREA' ? el.value : (el.innerText || '');
        const setText = (el, val) => {
            if (el.tagName === 'TEXTAREA') el.value = val;
            else el.innerText = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };

        const text = getText(editor);
        const BLOCK_RE = /※([\s\S]*?)※/g;
        const opts = readPromptOptions();
        const optionInners = opts.map(o => stripMarkers(o.text));
        const selectedInner = stripMarkers(selected);

        let m, replaced = false, out = '', last = 0;
        while ((m = BLOCK_RE.exec(text))) {
            const blockStart = m.index;
            const blockEnd = BLOCK_RE.lastIndex;
            const inner = m[1];

            let hit = optionInners.find(opt => inner.startsWith(opt));
            if (hit) {
                const innerNext = selectedInner + inner.slice(hit.length);
                out += text.slice(last, blockStart) + '※' + innerNext + '※';
                last = blockEnd;
                replaced = true;
                break;
            }
            hit = optionInners.find(opt => inner.includes(opt));
            if (hit) {
                const innerNext = inner.replace(hit, selectedInner);
                out += text.slice(last, blockStart) + '※' + innerNext + '※';
                last = blockEnd;
                replaced = true;
                break;
            }
        }
        if (replaced) {
            const nextText = out + text.slice(last);
            if (nextText !== text) setText(editor, nextText);
        }
    }, true);
})();
