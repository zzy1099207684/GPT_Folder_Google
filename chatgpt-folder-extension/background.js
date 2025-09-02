chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    // —— 写入：保持原逻辑 —— //
    if (msg.type === 'save-folders') {
        const folders = msg.data || {};
        const folderKeys = Object.keys(folders);
        const out = { folderKeys };
        const MAX_BYTES = 6 * 1024;

        function packOne(id, data) {
            const { name='Group', collapsed=false, prompts=[], chats=[] } = data || {};
            const base = { name, collapsed, prompts };
            const baseCost = JSON.stringify({ ...base, chats: [] }).length;
            let buf = [], used = baseCost, parts = 0;
            const flush = () => {
                if (!buf.length) return;
                out[`f_${id}__p${parts}`] = { chats: buf };
                parts += 1; buf = []; used = baseCost;
            };
            for (const c of (chats || [])) {
                const inc = JSON.stringify(c).length + 2;
                if (used + inc > MAX_BYTES) {
                    if (buf.length) flush();
                    if (baseCost + inc > MAX_BYTES) {
                        out[`f_${id}__p${parts}`] = { chats: [c] };
                        parts += 1; used = baseCost; continue;
                    }
                }
                buf.push(c); used += inc;
            }
            flush();
            out[`f_${id}__meta`] = { ...base, parts };
            out[`f_${id}`] = undefined; // 清理旧键
        }

        folderKeys.forEach(id => packOne(id, folders[id]));
        chrome.storage.sync.set(out, () => { void chrome.runtime.lastError; });
        // 可选应答，便于调用方等待
        try { sendResponse && sendResponse({ ok: true }); } catch {}
        return true; // 异步
    }

    // —— 读取：新增，重组分片放在后台 —— //
    if (msg.type === 'get-folders') {
        (async () => {
            try {
                const { folderKeys = [] } = await chrome.storage.sync.get('folderKeys');
                if (!folderKeys.length) {
                    const legacy = await chrome.storage.sync.get('folders');
                    sendResponse({ ok: true, folders: legacy.folders || {} });
                    return;
                }
                const metaKeys = folderKeys.map(id => `f_${id}__meta`);
                const metas = await chrome.storage.sync.get(metaKeys);

                // 收集所有分片键
                const partKeys = [];
                folderKeys.forEach(id => {
                    const m = metas[`f_${id}__meta`];
                    if (m && Number.isInteger(m.parts) && m.parts > 0) {
                        for (let i = 0; i < m.parts; i++) partKeys.push(`f_${id}__p${i}`);
                    }
                });
                const [partsObj, gapObj, singlesObj] = await Promise.all([
                    partKeys.length ? chrome.storage.sync.get(partKeys) : Promise.resolve({}),
                    chrome.storage.sync.get('folderGaps'),
                    chrome.storage.sync.get(folderKeys.map(id => 'f_' + id))
                ]);
                const gapMap = (gapObj && gapObj.folderGaps) || {};
                const folders = {};

                for (const id of folderKeys) {
                    const meta = metas[`f_${id}__meta`];
                    if (meta && Number.isInteger(meta.parts)) {
                        let chats = [];
                        for (let i = 0; i < (meta.parts || 0); i++) {
                            const part = partsObj[`f_${id}__p${i}`];
                            if (part && Array.isArray(part.chats)) chats = chats.concat(part.chats);
                        }
                        folders[id] = {
                            name: meta.name || 'Group',
                            collapsed: !!meta.collapsed,
                            prompts: Array.isArray(meta.prompts) ? meta.prompts : [],
                            gap: Number.isFinite(gapMap[id]) ? gapMap[id] : (Number.isFinite(meta.gap) ? meta.gap : 0),
                            chats
                        };
                    } else {
                        folders[id] = singlesObj['f_' + id] || {};
                    }
                }
                sendResponse({ ok: true, folders });
            } catch (e) {
                try { sendResponse({ ok: false, error: String(e && e.message || e) }); } catch {}
            }
        })();
        return true; // 异步
    }
});
