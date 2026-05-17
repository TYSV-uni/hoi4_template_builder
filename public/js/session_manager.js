window.SessionManager = {
    currentSessionName: null, 
    _lastSavedState:    null, 
    _pollTimer:         null,
    _liveRef:           null, 
    _liveSname:         null, 

    

    _collectState() {
        const techProgress = {};
        if (window.engine) {
            window.engine.researchedTechs.forEach(t => techProgress[t] = true);
        }
        return {
            techTreeProgress:  JSON.stringify(techProgress),
            divisionTemplates: JSON.stringify(window.templateBuilder?._templates || {})
        };
    },

    _stateJson() {
        return JSON.stringify(this._collectState());
    },

    hasUnsavedSessionChanges() {
        if (this._lastSavedState === null) {
            
            const s = this._collectState();
            return s.techTreeProgress !== '{}' || s.divisionTemplates !== '{}';
        }
        return this._stateJson() !== this._lastSavedState;
    },

    _markSaved() {
        this._lastSavedState = this._stateJson();
        this._updateTopBar();
    },

    _updateLiveRefBtn() {
        const btn = document.getElementById('live-refresh-btn');
        if (!btn) return;
        if (this._liveRef) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    },

    
    

    _encodeState(state) {
        return btoa(encodeURIComponent(JSON.stringify(state))
            .replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    },

    _decodeState(b64) {
        return JSON.parse(decodeURIComponent(
            Array.from(atob(b64), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
        ));
    },

    

    _updateTopBar() {
        const nameEl  = document.getElementById('session-name-display');
        const starEl  = document.getElementById('session-dirty-star');
        if (!nameEl) return;

        const name  = this.currentSessionName || 'Session';
        const dirty = this.hasUnsavedSessionChanges();

        
        const len  = name.length;
        const size = len <= 15 ? 13 : len <= 22 ? 11 : 9;
        nameEl.style.fontSize = size + 'px';
        nameEl.textContent    = name;
        nameEl.title          = name; 

        if (starEl) starEl.style.display = dirty ? 'inline' : 'none';
    },

    startPolling() {
        clearInterval(this._pollTimer);
        this._pollTimer = setInterval(() => this._updateTopBar(), 3000);
    },

    

    _applyState(state) {
        if (!state) return false;

        if (window.engine) {
            const saved = JSON.parse(state.techTreeProgress || '{}');
            window.engine.researchedTechs = new Set(Object.keys(saved).filter(k => saved[k]));
            window.engine.recalculateAll();
        }
        if (window.templateBuilder) {
            try {
                window.templateBuilder._templates = JSON.parse(state.divisionTemplates || '{}');
            } catch { window.templateBuilder._templates = {}; }
            window.templateBuilder.renderTemplateList?.();
        }

        if (typeof switchTab === 'function') switchTab(currentTab);
        return true;
    },

    

    async fetchSessionList(username) {
        
        const res  = await fetch(`/api/users/${encodeURIComponent(username)}/sessions`);
        const data = await res.json();
        return data.ok ? data.sessions : [];
    },

    async saveAsNew(username, name) {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/sessions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name, session: this._collectState() })
        });
        return await res.json();
    },

    async overwrite(username, name) {
        const res = await fetch(
            `/api/users/${encodeURIComponent(username)}/sessions/${encodeURIComponent(name)}`,
            {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ session: this._collectState() })
            }
        );
        return await res.json();
    },

    async loadSession(username, name) {
        const res  = await fetch(`/api/users/${encodeURIComponent(username)}/sessions/${encodeURIComponent(name)}`);
        const data = await res.json();
        if (!data.ok || !data.session) return false;
        this._applyState(data.session);
        this.currentSessionName = name;
        this._markSaved();
        return true;
    },

    async renameSession(username, name, newName) {
        const res = await fetch(
            `/api/users/${encodeURIComponent(username)}/sessions/${encodeURIComponent(name)}`,
            {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ newName })
            }
        );
        return await res.json();
    },

    
    async fetchByShareId(shareId) {
        const res = await fetch(`/api/sessions/ref/${encodeURIComponent(shareId)}`);
        return await res.json();
    },

    

    async onLogin(username) {
        if (window.SessionManager) window.SessionManager._updateTopBar();
    },

    

    onLogout() {
        
        this.currentSessionName = null;
        this._lastSavedState    = null;
        this._liveRef           = null;
        this._liveSname         = null;
        this._updateLiveRefBtn();
        this._updateTopBar();

        
        if (window.engine) {
            window.engine.researchedTechs = new Set();
            window.engine.recalculateAll();
        }

        
        if (window.templateBuilder) {
            window.templateBuilder._templates          = {};
            window.templateBuilder.supportSlots        = new Array(5).fill(null);
            window.templateBuilder.combatSlots         = Array.from({ length: 5 }, () => new Array(5).fill(null));
            window.templateBuilder.currentTemplateName = null;
            window.templateBuilder.viewMode            = false;
            window.templateBuilder.renderGrid?.();
            window.templateBuilder.updateStatsUI?.();
            window.templateBuilder.renderTemplateList?.();

            const nameInput = document.getElementById('hoi4-template-name');
            if (nameInput) { nameInput.value = 'New Division Template'; nameInput.disabled = false; }
            document.getElementById('view-mode-badge')?.classList.add('hidden');
        }

        
        if (typeof switchTab === 'function' && typeof currentTab !== 'undefined') {
            switchTab(currentTab);
        }
    },

    

    _toast(msg) {
        let el = document.getElementById('session-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'session-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
    }
};

class SessionModal {
    constructor() {
        this._selectedSession = null;
        this._sessions        = [];
        this._view            = 'list'; 
        this._bindEvents();
        window.SessionManager.startPolling();
        this._checkImportParam();
    }

    

    open() {
        this._selectedSession = null;
        this._view            = 'list';
        this._showListView();
        document.getElementById('session-overlay').classList.add('visible');

        if (window.AuthManager.isLoggedIn()) {
            this._loadSessions();
        } else {
            document.getElementById('session-list').innerHTML =
                '<div class="session-placeholder">Log in to manage server sessions.</div>';
        }
        this._renderFooter();
    }

    close() {
        document.getElementById('session-overlay').classList.remove('visible');
        this._view = 'list';
        this._showListView();
    }

    

    _bindEvents() {
        document.getElementById('manage-sessions-btn')
            ?.addEventListener('click', () => this.open());

        document.getElementById('live-refresh-btn')
            ?.addEventListener('click', async () => {
                const ref   = window.SessionManager._liveRef;
                const sname = window.SessionManager._liveSname;
                if (!ref) return;
                await this._applyImport({ mode: 'ref', payload: ref, sname });
            });

        document.getElementById('session-close')
            .addEventListener('click', () => this.close());

        document.getElementById('session-overlay')
            .addEventListener('click', e => { if (e.target.id === 'session-overlay') this.close(); });

        
        document.getElementById('session-list')
            .addEventListener('click', e => {
                if (!e.target.closest('.session-item')) {
                    this._selectedSession = null;
                    this._view = 'list';
                    this._renderList();
                    this._renderFooter();
                }
            });

        
        const _deselect = e => {
            if (this._view !== 'list' || !this._selectedSession) return;
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('form')) return;
            this._selectedSession = null;
            this._renderList();
            this._renderFooter();
        };
        document.getElementById('session-header').addEventListener('click', _deselect);
        document.getElementById('session-footer').addEventListener('click', _deselect);
    }

    

    async _loadSessions() {
        const list = document.getElementById('session-list');
        list.innerHTML = '<div class="session-placeholder">Loading...</div>';
        try {
            this._sessions = await window.SessionManager.fetchSessionList(
                window.AuthManager.currentUser.username
            );
            this._renderList();
        } catch {
            list.innerHTML = '<div class="session-placeholder">Failed to load sessions.</div>';
        }
    }

    _renderList() {
        const list = document.getElementById('session-list');
        list.innerHTML = '';

        if (this._sessions.length === 0) {
            list.innerHTML = '<div class="session-placeholder">No saved sessions yet.</div>';
            return;
        }

        this._sessions.forEach(s => {
            const item = document.createElement('div');
            item.className = 'session-item' +
                (this._selectedSession?.name === s.name ? ' active' : '');

            const nameSpan = document.createElement('span');
            nameSpan.className   = 'session-item-name';
            nameSpan.textContent = s.name;
            nameSpan.title       = s.name; 

            const timeSpan = document.createElement('span');
            timeSpan.className   = 'session-item-time';
            timeSpan.textContent = this._relTime(s.updated_at);

            const renameBtn = document.createElement('button');
            renameBtn.className   = 'session-rename-btn';
            renameBtn.textContent = '✎';
            renameBtn.title       = 'Rename';
            renameBtn.addEventListener('click', e => {
                e.stopPropagation(); 
                this._selectedSession = s;
                this._view = 'rename';
                this._renderFooter();
            });

            item.appendChild(nameSpan);
            item.appendChild(timeSpan);
            item.appendChild(renameBtn);

            item.addEventListener('click', () => {
                this._selectedSession = s;
                this._view = 'list';
                this._renderList();
                this._renderFooter();
            });

            list.appendChild(item);
        });
    }

    

    _renderFooter() {
        const footer = document.getElementById('session-footer');
        footer.innerHTML = '';

        
        if (this._view === 'share') {
            footer.appendChild(this._btn('Back', () => {
                this._view = 'list';
                this._showListView();
                this._renderFooter();
            }));
            return;
        }

        
        if (this._view === 'save-name') {
            const form      = document.createElement('form');
            form.style.display = 'contents';
            const input     = this._nameInput(window.SessionManager.currentSessionName || 'Session');
            const saveBtn   = this._btn('Save', null);
            saveBtn.type    = 'submit';
            const cancelBtn = this._btn('Cancel', () => { this._view = 'list'; this._renderFooter(); });
            cancelBtn.type  = 'button';
            form.appendChild(input);
            form.appendChild(saveBtn);
            form.appendChild(cancelBtn);
            form.addEventListener('submit', e => { e.preventDefault(); this._confirmSaveNew(input.value.trim()); });
            footer.appendChild(form);
            setTimeout(() => { input.focus(); input.select(); }, 50);
            return;
        }

        
        if (this._view === 'rename') {
            const form      = document.createElement('form');
            form.style.display = 'contents';
            const label     = document.createElement('span');
            label.className   = 'session-confirm-text';
            label.textContent = `Rename "${this._selectedSession?.name}"`;
            const input     = this._nameInput(this._selectedSession?.name || '');
            const okBtn     = this._btn('OK', null);
            okBtn.type      = 'submit';
            const cancelBtn = this._btn('Cancel', () => { this._view = 'list'; this._renderFooter(); });
            cancelBtn.type  = 'button';
            form.appendChild(label);
            form.appendChild(input);
            form.appendChild(okBtn);
            form.appendChild(cancelBtn);
            form.addEventListener('submit', e => { e.preventDefault(); this._confirmRename(input.value.trim()); });
            footer.appendChild(form);
            setTimeout(() => { input.focus(); input.select(); }, 50);
            return;
        }

        
        if (this._view === 'confirm-overwrite') {
            const label = document.createElement('span');
            label.className   = 'session-confirm-text';
            label.textContent = `Overwrite "${this._selectedSession?.name}"?`;
            footer.appendChild(label);
            footer.appendChild(this._btn('Yes, overwrite', () => this._doOverwrite()));
            footer.appendChild(this._btn('Cancel', () => { this._view = 'list'; this._renderFooter(); }));
            return;
        }

        
        if (this._selectedSession) {
            const isActive = this._selectedSession.name === window.SessionManager.currentSessionName;
            footer.appendChild(this._btn('Share', () => this._handleShare()));
            footer.appendChild(this._btn('Load',  () => this._handleLoad()));
            if (isActive) {
                
                footer.appendChild(this._btn('Update', () => this._doOverwrite()));
            } else {
                footer.appendChild(this._btn('Overwrite', () => {
                    this._view = 'confirm-overwrite';
                    this._renderFooter();
                }));
            }
            return;
        }

        
        if (this._view === 'import') {
            const form      = document.createElement('form');
            form.style.display = 'contents';
            const input     = document.createElement('input');
            input.type        = 'text';
            input.className   = 'hoi4-input session-name-input';
            input.placeholder = 'Paste share link...';
            const importBtn = this._btn('Import', null);
            importBtn.type  = 'submit';
            const cancelBtn = this._btn('Cancel', () => { this._view = 'list'; this._renderFooter(); });
            cancelBtn.type  = 'button';
            form.appendChild(input);
            form.appendChild(importBtn);
            form.appendChild(cancelBtn);
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const raw = input.value.trim();
                if (!raw) return;
                
                try {
                    const u     = new URL(raw);
                    const ref   = u.searchParams.get('ref');
                    const imp   = u.searchParams.get('import');
                    const sname = u.searchParams.get('sname');
                    if (ref)      await this._applyImport({ mode: 'ref',      payload: ref, sname });
                    else if (imp) await this._applyImport({ mode: 'snapshot', payload: imp, sname });
                    else alert('Unrecognised share link format.');
                } catch {
                    
                    await this._applyImport({ mode: 'snapshot', payload: raw, sname: null });
                }
            });
            footer.appendChild(form);
            setTimeout(() => input.focus(), 50);
            return;
        }

        
        const importBtn  = this._btn('Import', () => this._handleImport());
        const saveNewBtn = this._btn('Save as New', () => {
            if (!window.AuthManager.isLoggedIn()) return;
            this._view = 'save-name';
            this._renderFooter();
        });
        if (!window.AuthManager.isLoggedIn()) saveNewBtn.disabled = true;
        footer.appendChild(importBtn);
        footer.appendChild(saveNewBtn);
    }

    

    async _handleLoad() {
        if (window.SessionManager.hasUnsavedSessionChanges()) {
            if (!confirm('You have unsaved changes. Load this session and lose them?')) return;
        }
        const ok = await window.SessionManager.loadSession(
            window.AuthManager.currentUser.username,
            this._selectedSession.name
        );
        if (ok) {
            window.SessionManager._toast(`"${this._selectedSession.name}" loaded.`);
            this.close();
        }
    }

    async _doOverwrite() {
        const result = await window.SessionManager.overwrite(
            window.AuthManager.currentUser.username,
            this._selectedSession.name
        );
        if (result.ok) {
            window.SessionManager.currentSessionName = this._selectedSession.name;
            window.SessionManager._markSaved();
            window.SessionManager._toast(`"${this._selectedSession.name}" overwritten.`);
            this._view            = 'list';
            this._selectedSession = null;
            await this._loadSessions();
            this._renderFooter();
        } else {
            alert(result.error || 'Failed to overwrite session.');
            this._view = 'list';
            this._renderFooter();
        }
    }

    
    
    async _handleShare() {
        const username    = window.AuthManager.currentUser.username;
        const sessionName = this._selectedSession.name;

        const res  = await fetch(`/api/users/${encodeURIComponent(username)}/sessions/${encodeURIComponent(sessionName)}`);
        const data = await res.json();
        if (!data.ok) { alert('Failed to load session data for sharing.'); return; }

        this._showShareView({
            sessionData: data.session,
            shareId:     data.share_id,    
            name:        sessionName
        });
    }

    

    _showShareView({ sessionData, shareId, name }) {
        this._view = 'share';
        document.getElementById('session-list-view').classList.add('hidden');
        document.getElementById('session-share-view').classList.remove('hidden');

        const urlInput = document.getElementById('session-share-url');
        const copyBtn  = document.getElementById('session-share-copy');

        
        const snameParam  = name ? `&sname=${encodeURIComponent(name)}` : '';
        const base        = `${location.origin}${location.pathname}`;
        const snapshotUrl = `${base}?import=${window.SessionManager._encodeState(sessionData)}${snameParam}`;
        const liveUrl     = `${base}?ref=${shareId}${snameParam}`;

        
        const shareView = document.getElementById('session-share-view');
        let toggleRow = shareView.querySelector('.session-share-toggle-row');
        if (!toggleRow) {
            toggleRow = document.createElement('div');
            toggleRow.className = 'session-share-toggle-row';
            toggleRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;';

            const checkbox = document.createElement('input');
            checkbox.type      = 'checkbox';
            checkbox.id        = 'session-auto-update-toggle';
            checkbox.checked   = false; 

            const label = document.createElement('label');
            label.htmlFor     = 'session-auto-update-toggle';
            label.textContent = 'Auto-update (live link)';
            label.title       = 'When on, recipients always see your latest saved state. When off, the link is a fixed snapshot of the session right now.';
            label.style.cursor = 'help';

            toggleRow.appendChild(checkbox);
            toggleRow.appendChild(label);
            shareView.insertBefore(toggleRow, urlInput);
        }

        const checkbox = document.getElementById('session-auto-update-toggle');
        checkbox.checked = false; 

        const updateUrl = () => {
            urlInput.value      = checkbox.checked ? liveUrl : snapshotUrl;
            copyBtn.textContent = 'Copy to Clipboard';
            urlInput.select();
        };

        checkbox.onchange = updateUrl;
        updateUrl();

        copyBtn.onclick = () => {
            navigator.clipboard.writeText(urlInput.value).then(() => {
                copyBtn.textContent = 'Copied!';
            });
        };

        this._renderFooter();
    }

    _showListView() {
        document.getElementById('session-list-view').classList.remove('hidden');
        document.getElementById('session-share-view').classList.add('hidden');
    }

    async _handleImport() {
        if (window.SessionManager.hasUnsavedSessionChanges()) {
            if (!confirm('You have unsaved changes. Import and lose them?')) return;
        }
        this._view = 'import';
        this._renderFooter();
    }

    
    async _applyImport({ mode, payload, sname }) {
        let sessionData;

        if (mode === 'snapshot') {
            try {
                sessionData = window.SessionManager._decodeState(payload);
            } catch {
                alert('Invalid or corrupted share link.');
                return;
            }
        } else {
            
            const result = await window.SessionManager.fetchByShareId(payload);
            if (!result.ok || !result.session) {
                alert('Session not found. The owner may have deleted it.');
                return;
            }
            sessionData = result.session;
            sname = sname || result.name;
        }

        window.SessionManager._applyState(sessionData);
        window.SessionManager._lastSavedState = JSON.stringify(sessionData);
        const label = sname || '(imported)';
        window.SessionManager.currentSessionName =
            mode === 'ref' ? `${label} (live)` : `${label} (imported)`;
        
        if (mode === 'ref') {
            window.SessionManager._liveRef   = payload;
            window.SessionManager._liveSname = sname || null;
        } else {
            window.SessionManager._liveRef   = null;
            window.SessionManager._liveSname = null;
        }
        window.SessionManager._updateLiveRefBtn();
        window.SessionManager._updateTopBar();
        window.SessionManager._toast(`${label} imported.`);
        this.close();
    }

    async _confirmRename(newName) {
        if (!newName) { alert('Please enter a name.'); return; }
        const username = window.AuthManager.currentUser.username;
        const result   = await window.SessionManager.renameSession(
            username, this._selectedSession.name, newName
        );
        if (result.ok) {
            
            if (window.SessionManager.currentSessionName === this._selectedSession.name) {
                window.SessionManager.currentSessionName = newName;
                window.SessionManager._updateTopBar();
            }
            window.SessionManager._toast(`Renamed to "${newName}".`);
            this._view            = 'list';
            this._selectedSession = null;
            await this._loadSessions();
            this._renderFooter();
        } else {
            alert(result.error || 'Failed to rename session.');
        }
    }

    async _confirmSaveNew(name) {
        if (!name) { alert('Please enter a session name.'); return; }

        const result = await window.SessionManager.saveAsNew(
            window.AuthManager.currentUser.username,
            name
        );
        if (result.ok) {
            window.SessionManager.currentSessionName = name;
            window.SessionManager._markSaved();
            window.SessionManager._toast(`"${name}" saved.`);
            this._view            = 'list';
            this._selectedSession = null;
            await this._loadSessions();
            this._renderFooter();
        } else {
            alert(result.error || 'Failed to save session.');
        }
    }

    
    

    _checkImportParam() {
        const params = new URLSearchParams(window.location.search);
        const imp    = params.get('import');
        const ref    = params.get('ref');
        const sname  = params.get('sname');

        if (!imp && !ref) return;

        
        
        
        
        if (imp) history.replaceState({}, '', window.location.pathname);

        
        setTimeout(async () => {
            
            
            if (!ref && window.SessionManager.hasUnsavedSessionChanges()) {
                if (!confirm('You have unsaved changes. Import the linked session and lose them?')) return;
            }
            if (ref) await this._applyImport({ mode: 'ref',      payload: ref, sname });
            else     await this._applyImport({ mode: 'snapshot', payload: imp, sname });
        }, 1200);
    }

    

    _btn(label, onClick) {
        const b       = document.createElement('button');
        b.className   = 'hoi4-btn';
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    _nameInput(value = '') {
        const input       = document.createElement('input');
        input.type        = 'text';
        input.className   = 'hoi4-input session-name-input';
        input.placeholder = 'Session name...';
        input.value       = value;
        return input;
    }

    _relTime(isoStr) {
        if (!isoStr) return '';
        const diff = Date.now() - new Date(isoStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)  return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.sessionModal = new SessionModal();
});