// 书签分组：弹出菜单（add group / Export / Import）与备份导入导出
(() => {
    if (window.cgptBookmarkMenu) return;

    function makeMenu(addBtn, deps) {
        const {
            addGroup,                     // () => void
            getFolders,                   // () => object
            setFolders,                   // (next) => void
            storage,                      // {get,set}
            safeSendMessage,              // (msg) => void
            render,                       // () => void
            fontSelect,                   // <select> | null
            sizeSelect                    // <select> | null
        } = deps;

        const pop = document.createElement('div');
        pop.style.cssText =
            'position:fixed;display:none;flex-direction:column;min-width:140px;' +
            'background:#2b2b2b;border-radius:8px;padding:6px 0;z-index:2147483647';
        document.body.appendChild(pop);

        const hideMenu = () => { pop.style.display = 'none'; };
        const onDocClick = (e) => {
            if (!addBtn.contains(e.target) && !pop.contains(e.target)) hideMenu();
        };

        async function doExport() {
            try {
                const folders = getFolders() || {};
                const font = document.documentElement.style.fontFamily || (await storage.get('pageFont')) || '';
                const size = document.documentElement.style.fontSize || (await storage.get('pageFontSize')) || '100%';
                const payload = {
                    type: 'cgpt-groups-backup',
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    pageFont: font,
                    pageFontSize: size,
                    folders
                };
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                const a = document.createElement('a');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                a.download = `cgpt_groups_backup_${ts}.json`;
                a.href = URL.createObjectURL(blob);
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
            } catch { alert('Export failed'); }
        }

        function doImport() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const obj = JSON.parse(text);
                    if (!obj || obj.type !== 'cgpt-groups-backup' || typeof obj.folders !== 'object') {
                        alert('Invalid backup file');
                        return;
                    }
                    // 应用分组
                    const folders = obj.folders || {};
                    const order = Object.keys(folders);
                    setFolders(folders);

                    // 应用 Font/Size 到页面与下拉框
                    const fnt = obj.pageFont || 'inherit';
                    const sz  = (typeof obj.pageFontSize === 'string' && obj.pageFontSize.endsWith('%')) ? obj.pageFontSize : '100%';
                    document.documentElement.style.fontFamily = fnt;
                    document.documentElement.style.fontSize   = sz;
                    try { if (fontSelect) fontSelect.value = fnt; } catch {}
                    try { if (sizeSelect) sizeSelect.value = sz; }  catch {}

                    if (chrome?.runtime?.id) {
                        await storage.set({ folders, folderOrder: order });
                        await storage.set({ pageFont: fnt, pageFontSize: sz });
                        safeSendMessage({ type: 'save-folders', data: folders });
                    }
                    render();
                } catch { alert('Import failed'); }
            };
            input.click();
        }

        function mkItem(txt, handler, danger) {
            const d = document.createElement('div');
            d.textContent = txt;
            d.style.cssText = `padding:6px 12px;cursor:pointer;white-space:nowrap${danger ? ';color:#e66' : ''}`;
            d.onclick = () => { handler(); hideMenu(); };
            return d;
        }

        function openMenu() {
            if (pop.style.display === 'block') { hideMenu(); return; }
            pop.innerHTML = '';
            pop.appendChild(mkItem('add group', addGroup));
            pop.appendChild(mkItem('Export', doExport));
            pop.appendChild(mkItem('Import', doImport));

            const r = addBtn.getBoundingClientRect();
            const left = Math.max(0, Math.min(r.right - 160, window.innerWidth - 160));
            pop.style.left = `${left}px`;
            pop.style.top  = `${r.bottom + 4}px`;
            pop.style.display = 'block';
        }

        const onAddBtnClick = () => openMenu();

        addBtn.addEventListener('click', onAddBtnClick);
        window.addEventListener('click', onDocClick, true);

        const destroy = () => {
            try {
                addBtn.removeEventListener('click', onAddBtnClick);
                window.removeEventListener('click', onDocClick, true);
                pop.remove();
            } catch {}
        };
        window.addEventListener('pagehide', destroy, { passive: true });

        return { destroy };
    }

    window.cgptBookmarkMenu = {
        attach(addBtn, deps) {
            if (!addBtn || !addBtn.addEventListener) return { destroy(){} };
            return makeMenu(addBtn, deps);
        }
    };
})();
