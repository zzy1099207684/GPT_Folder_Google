// background.js：处理 content.js 的保存请求
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'save-folders') {
        chrome.storage.sync.set({folders: msg.data});
    }
});
