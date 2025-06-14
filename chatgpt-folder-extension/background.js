// background.js：处理 content.js 的保存请求
// background.js：统一采用分片格式写入，避免单项超限
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'save-folders') return;

    const folders = msg.data || {};
    const folderKeys = Object.keys(folders);          // 索引键
    const chunked = { folderKeys };                   // 保存索引

    // 每个分组写入独立键 f_<id>
    folderKeys.forEach(id => {
        chunked['f_' + id] = folders[id];
    });

    // 只写入分片数据，不再写大对象 folders
    chrome.storage.sync.set(chunked);
});

