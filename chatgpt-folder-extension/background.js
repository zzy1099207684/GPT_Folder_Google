chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'save-folders') return;

    const folders = msg.data || {};
    const folderKeys = Object.keys(folders);
    const out = { folderKeys };
    const MAX_BYTES = 6 * 1024;

    function sizeOf(v){ return JSON.stringify(v).length; }
    function packOne(id, data){
        const { name='Group', collapsed=false, prompts=[], chats=[] } = data || {};
        const base = { name, collapsed, prompts };
        const baseCost = sizeOf({ ...base, chats: [] });
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
            const inc = sizeOf(c) + 2;
            if (used + inc > MAX_BYTES && buf.length) flush();
            buf.push(c);
            used += inc;
        }
        flush();
        out[`f_${id}__meta`] = { ...base, parts };
        out[`f_${id}`] = undefined; // 兼容清理旧键
    }
    folderKeys.forEach(id => packOne(id, folders[id]));
    chrome.storage.sync.set(out);

});

