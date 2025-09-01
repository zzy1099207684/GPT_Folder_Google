// 通用运行时工具：observers / enqueueIdleTask / debounce
(() => {
    if (window.__cgptUtilRuntimeInstalled) return;
    window.__cgptUtilRuntimeInstalled = true;

    // observers：统一管理 Mutation/Resize 等观察者，便于集中清理
    const observers = window.observers && typeof window.observers === 'object'
        ? window.observers
        : {
            list: [],
            add(observer) {
                this.list.push(observer);
                return observer;
            },
            disconnectAll() {
                this.list.forEach(obs => {
                    try { obs.disconnect?.(); } catch (e) { /* noop */ }
                });
                this.list = [];
            },
            cleanup() {
                const before = this.list.length;
                this.list = this.list.filter(obs => {
                    try { return !!(obs && typeof obs.disconnect === 'function'); }
                    catch { return false; }
                });
                // 可按需在此处上报 before - this.list.length
            }
        };
    window.observers = observers;              // 暴露到全局（content.js 直接用 observers）

    // 统一空闲执行。浏览器不支持 requestIdleCallback 时回退 setTimeout(0)
    if (typeof window.enqueueIdleTask !== 'function') {
        window.enqueueIdleTask = function enqueueIdleTask(fn, timeout = 1000) {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(fn, { timeout });
            } else {
                setTimeout(fn, 0);
            }
        };
    }

    // 防抖：保持签名一致
    if (typeof window.debounce !== 'function') {
        window.debounce = function debounce(fn, wait = 200) {
            let t;
            return function debounced(...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), wait);
            };
        };
    }
})();
