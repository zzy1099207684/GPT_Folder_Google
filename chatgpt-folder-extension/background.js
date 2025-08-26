chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'save-folders') return;

    const folders = msg.data || {};
    const folderKeys = Object.keys(folders);
    const out = { folderKeys };
    const MAX_BYTES = 6 * 1024;
    function packOne(id, data){
        const { name='Group', collapsed=false, prompts=[], chats=[] } = data || {};
        const base = { name, collapsed, prompts };
        const baseCost = JSON.stringify({ ...base, chats: [] }).length;
        let buf = [];
        let used = baseCost;
        let parts = 0;
        const flush = () => {
            if (!buf.length) return;
            out[`f_${id}__p${parts}`] = { chats: buf };
            parts += 1;
            buf = [];
            used = baseCost;
        };
        for (const c of chats) {
            const inc = JSON.stringify(c).length + 2;
            if (used + inc > MAX_BYTES) {
                if (buf.length) {
                    flush();                 // 先写出已累积分片
                }
                if (baseCost + inc > MAX_BYTES) {
                    // 单条异常大：隔离成独立分片，避免拖累后续分片
                    out[`f_${id}__p${parts}`] = { chats: [c] };
                    parts += 1;
                    used = baseCost;
                    continue;
                }
            }
            buf.push(c);
            used += inc;
        }
        flush();
        out[`f_${id}__meta`] = { ...base, parts };
        out[`f_${id}`] = undefined;
    }
    folderKeys.forEach(id => packOne(id, folders[id]));

    // 仅写一次；确保 out 已包含 folderKeys + 所有 f_*__meta 与分片键
    chrome.storage.sync.set(out, () => { void chrome.runtime.lastError; });

});

