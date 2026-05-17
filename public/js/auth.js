window.AuthManager = {
    currentUser: null,  

    isLoggedIn() { return !!this.currentUser; },
    isAdmin()    { return this.currentUser?.role === 'admin'; },

    loadSession() {
        const saved = localStorage.getItem('auth_session');
        if (saved) {
            try { this.currentUser = JSON.parse(saved); } catch (e) {}
        }
        this._updateUserMenu();
    },

    _updateUserMenu() {
        const openBtn      = document.getElementById('auth-open-btn');
        const userWrapper  = document.getElementById('user-menu-wrapper');
        const usernameSpan = document.getElementById('user-menu-username');
        const adminBtn     = document.getElementById('dd-manage-users');

        if (this.currentUser) {
            openBtn?.classList.add('hidden');
            userWrapper?.classList.remove('hidden');
            if (usernameSpan) usernameSpan.textContent = this.currentUser.username;
            if (adminBtn) adminBtn.classList.toggle('hidden', !this.isAdmin());
        } else {
            openBtn?.classList.remove('hidden');
            userWrapper?.classList.add('hidden');
        }
    },

    async register(username, password) {
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            return await res.json();
        } catch (e) {
            return { ok: false, error: 'Could not connect to server' };
        }
    },

    async login(username, password) {
        try {
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.ok) {
                this.currentUser = { username, role: data.role || 'user' };
                localStorage.setItem('auth_session', JSON.stringify(this.currentUser));
                this._updateUserMenu();
                if (window.SessionManager) window.SessionManager.onLogin(username);
            }

            return data;
        } catch (e) {
            return { ok: false, error: 'Could not connect to server' };
        }
    },

    logout() {
        this.currentUser = null;
        localStorage.removeItem('auth_session');
        document.cookie = 'username=; Max-Age=0; path=/;';
        this._updateUserMenu();

        if (window.SessionManager) window.SessionManager.onLogout();
    },

    async changePassword(newPassword) {
        const username = this.currentUser?.username;
        if (!username) return { ok: false, error: 'Not logged in' };
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            });
            return await res.json();
        } catch (e) {
            return { ok: false, error: 'Could not connect to server' };
        }
    },

    async deleteAccount(password) {
        const username = this.currentUser?.username;
        if (!username) return { ok: false, error: 'Not logged in' };
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            return await res.json();
        } catch (e) {
            return { ok: false, error: 'Could not connect to server' };
        }
    }
};

class UserDropdown {
    constructor() {
        this._isOpen = false;
        this._bindEvents();
    }

    _bindEvents() {
        document.getElementById('user-menu-btn')
            ?.addEventListener('click', e => { e.stopPropagation(); this._toggle(); });

        
        document.addEventListener('click', () => { if (this._isOpen) this._close(); });

        document.getElementById('dd-logout')
            ?.addEventListener('click', () => { this._close(); window.AuthManager.logout(); });

        document.getElementById('dd-reset-pw')
            ?.addEventListener('click', () => { this._close(); window.accountActionModal?.open('reset-password'); });

        document.getElementById('dd-delete-acct')
            ?.addEventListener('click', () => { this._close(); window.accountActionModal?.open('delete-account'); });

        document.getElementById('dd-manage-users')
            ?.addEventListener('click', () => { this._close(); window.adminModal?.open(); });
    }

    _toggle() { this._isOpen ? this._close() : this._open(); }

    _open() {
        this._isOpen = true;
        document.getElementById('user-dropdown')?.removeAttribute('hidden');
        document.getElementById('user-menu-btn')?.setAttribute('aria-expanded', 'true');
    }

    _close() {
        this._isOpen = false;
        document.getElementById('user-dropdown')?.setAttribute('hidden', '');
        document.getElementById('user-menu-btn')?.setAttribute('aria-expanded', 'false');
    }
}

class AuthModal {
    constructor() {
        this._tab = 'login';
        this._bindEvents();
        window.AuthManager.loadSession();
    }

    open() {
        if (window.AuthManager.isLoggedIn()) return;
        this._showForm();
        document.getElementById('auth-overlay').classList.add('visible');
        setTimeout(() => document.getElementById('auth-username')?.focus(), 50);
    }

    close() {
        document.getElementById('auth-overlay').classList.remove('visible');
        this._clearError();
    }

    _bindEvents() {
        document.getElementById('auth-open-btn')
            ?.addEventListener('click', () => this.open());

        document.getElementById('auth-close')
            .addEventListener('click', () => this.close());

        document.getElementById('auth-overlay')
            .addEventListener('click', e => { if (e.target.id === 'auth-overlay') this.close(); });

        document.getElementById('auth-switch')
            .addEventListener('click', e => { if (e.target.dataset.tab) this._switchTab(e.target.dataset.tab); });

        document.getElementById('auth-body')
            .addEventListener('submit', e => { e.preventDefault(); this._submit(); });

        document.getElementById('auth-logout')
            .addEventListener('click', () => { window.AuthManager.logout(); this._showForm(); });
    }

    _switchTab(tab) {
        this._tab = tab;
        const isRegister = tab === 'register';

        document.getElementById('auth-confirm-wrap').classList.toggle('hidden', !isRegister);
        document.getElementById('auth-submit').textContent = isRegister ? 'Register' : 'Login';

        const sw = document.getElementById('auth-switch');
        sw.innerHTML = isRegister
            ? `Have an account? <span data-tab="login">Login</span>`
            : `No account? <span data-tab="register">Register here</span>`;

        this._clearError();
    }

    async _submit() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        const confirm  = document.getElementById('auth-confirm').value;

        if (!username || !password) return this._showError('Please fill in all fields');

        const btn = document.getElementById('auth-submit');
        btn.disabled = true;

        try {
            let result;
            if (this._tab === 'register') {
                if (password !== confirm) return this._showError('Passwords do not match');
                result = await window.AuthManager.register(username, password);
                if (result.ok) result = await window.AuthManager.login(username, password);
            } else {
                result = await window.AuthManager.login(username, password);
            }

            if (result.ok) { this.close(); }
            else           { this._showError(result.error); }
        } finally {
            btn.disabled = false;
        }
    }

    _showForm() {
        document.getElementById('auth-body').style.display           = 'flex';
        document.getElementById('auth-user-section').style.display   = 'none';
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-confirm').value  = '';
        this._switchTab('login');
    }

    _showError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent  = msg;
        el.style.display = 'block';
    }

    _clearError() {
        const el = document.getElementById('auth-error');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
    }
}

class AccountActionModal {
    constructor() {
        this._mode = null;
        this._bindEvents();
    }

    open(mode) {
        this._mode = mode;
        this._render();
        document.getElementById('acct-overlay').classList.add('visible');
    }

    close() {
        document.getElementById('acct-overlay').classList.remove('visible');
        document.getElementById('acct-body').innerHTML  = '';
        document.getElementById('acct-error').textContent = '';
    }

    _bindEvents() {
        document.getElementById('acct-overlay')
            .addEventListener('click', e => { if (e.target.id === 'acct-overlay') this.close(); });

        document.getElementById('acct-close')
            .addEventListener('click', () => this.close());

        document.getElementById('acct-cancel')
            .addEventListener('click', () => this.close());

        document.getElementById('acct-form')
            .addEventListener('submit', e => { e.preventDefault(); this._submit(); });
    }

    _render() {
        const title  = document.getElementById('acct-title');
        const body   = document.getElementById('acct-body');
        const submit = document.getElementById('acct-submit');
        document.getElementById('acct-error').textContent = '';

        if (this._mode === 'reset-password') {
            title.textContent  = 'Reset Password';
            submit.textContent = 'Change Password';
            submit.className   = 'hoi4-btn';

            
            body.innerHTML = `
                <div class="auth-field">
                    <label for="acct-new-pw">Password</label>
                    <input type="password" id="acct-new-pw"
                           autocomplete="new-password" placeholder="Enter password...">
                </div>
                <div class="auth-field">
                    <label for="acct-conf-pw">Confirm Password</label>
                    <input type="password" id="acct-conf-pw"
                           autocomplete="new-password" placeholder="Repeat password...">
                </div>`;
            setTimeout(() => document.getElementById('acct-new-pw')?.focus(), 50);

        } else { 
            title.textContent  = 'Delete Account';
            submit.textContent = 'Delete Account';
            submit.className   = 'hoi4-btn acct-delete-btn';

            body.innerHTML = `
                <p class="acct-warning">
                    ⚠ This action is <strong>permanent</strong>.
                    All your sessions will be deleted and cannot be recovered.
                </p>
                <div class="auth-field">
                    <label for="acct-del-pw">Confirm Password</label>
                    <input type="password" id="acct-del-pw" class="hoi4-input"
                           autocomplete="current-password" placeholder="Enter your password…">
                </div>`;
            setTimeout(() => document.getElementById('acct-del-pw')?.focus(), 50);
        }
    }

    async _submit() {
        const submit = document.getElementById('acct-submit');
        submit.disabled = true;

        try {
            if (this._mode === 'reset-password') {
                const nw   = document.getElementById('acct-new-pw').value;
                const conf = document.getElementById('acct-conf-pw').value;

                if (!nw || !conf)  return this._showError('Please fill in all fields');
                if (nw !== conf)   return this._showError('New passwords do not match');
                if (nw.length < 6) return this._showError('Password: minimum 6 characters');

                const result = await window.AuthManager.changePassword(nw);
                if (result.ok) { this.close(); window.SessionManager?._toast('Password changed successfully.'); }
                else           { this._showError(result.error); }

            } else {
                const pw = document.getElementById('acct-del-pw').value;
                if (!pw) return this._showError('Password required to confirm deletion');

                const result = await window.AuthManager.deleteAccount(pw);
                if (result.ok) {
                    this.close();
                    window.AuthManager.logout();
                    window.SessionManager?._toast('Account deleted.');
                } else {
                    this._showError(result.error);
                }
            }
        } finally {
            submit.disabled = false;
        }
    }

    _showError(msg) { document.getElementById('acct-error').textContent = msg; }
}

class AdminModal {
    constructor() {
        this._view         = 'users'; 
        this._selectedUser = null;
        this._allUsers     = [];
        this._bindEvents();
    }

    open() {
        if (!window.AuthManager.isAdmin()) return;
        this._view = 'users';
        document.getElementById('admin-search').value = '';
        document.getElementById('admin-overlay').classList.add('visible');
        this._loadUsers();
    }

    close() {
        document.getElementById('admin-overlay').classList.remove('visible');
    }

    _bindEvents() {
        document.getElementById('admin-overlay')
            .addEventListener('click', e => { if (e.target.id === 'admin-overlay') this.close(); });

        document.getElementById('admin-close')
            .addEventListener('click', () => this.close());

        document.getElementById('admin-back-btn')
            .addEventListener('click', () => this._showUsersView());

        
        document.getElementById('admin-search')
            .addEventListener('input', e => this._filterUsers(e.target.value));
    }

    

    async _loadUsers() {
        this._showUsersView();
        const tbody = document.getElementById('admin-users-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="admin-loading">Loading…</td></tr>';
        this._setStatus('');

        try {
            const res  = await fetch('/api/admin/users');
            const data = await res.json();
            if (!data.ok) { this._setStatus(data.error); return; }

            this._allUsers = data.users;
            this._renderUsers(this._allUsers);
        } catch (e) {
            this._setStatus('Failed to load users.');
        }
    }

    async _loadUserSessions(username) {
        this._selectedUser = username;
        document.getElementById('admin-sessions-title').textContent = `${username}'s Sessions`;

        const list = document.getElementById('admin-sessions-list');
        list.innerHTML = '<div class="admin-loading">Loading…</div>';
        this._showSessionsView();

        try {
            const res  = await fetch(`/api/admin/users/${encodeURIComponent(username)}/sessions`);
            const data = await res.json();
            list.innerHTML = '';

            if (!data.ok) { list.innerHTML = `<div class="admin-loading">${this._esc(data.error)}</div>`; return; }
            if (!data.sessions.length) { list.innerHTML = '<div class="admin-loading">No sessions found.</div>'; return; }

            for (const sess of data.sessions) {
                const row = document.createElement('div');
                row.className = 'admin-session-row';
                row.innerHTML = `
                    <span class="admin-sess-name">${this._esc(sess.name)}</span>
                    <span class="admin-sess-time">${this._relTime(sess.updated_at)}</span>
                    <button class="hoi4-btn admin-load-btn"
                            data-name="${this._esc(sess.name)}">Load Copy</button>`;
                list.appendChild(row);
            }

            list.querySelectorAll('.admin-load-btn').forEach(btn => {
                btn.addEventListener('click', () =>
                    this._loadSessionCopy(username, btn.dataset.name));
            });
        } catch (e) {
            list.innerHTML = '<div class="admin-loading">Error loading sessions.</div>';
        }
    }

    

    _renderUsers(users) {
        const tbody = document.getElementById('admin-users-tbody');
        tbody.innerHTML = '';

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="admin-loading">No users found.</td></tr>';
            return;
        }

        for (const user of users) {
            const isSelf = user.username === window.AuthManager.currentUser?.username;
            const tr = document.createElement('tr');
            tr.className = 'admin-user-row';

            tr.innerHTML = `
                <td class="admin-td admin-td--user">${this._esc(user.username)}</td>
                <td class="admin-td">
                    <span class="role-badge role-badge--${this._esc(user.role)}">${this._esc(user.role)}</span>
                </td>
                <td class="admin-td admin-td--center">${user.session_count}</td>
                <td class="admin-td admin-td--actions">
                    <button class="hoi4-btn admin-view-btn"
                            data-username="${this._esc(user.username)}">View</button>
                    <button class="hoi4-btn admin-del-btn"
                            data-username="${this._esc(user.username)}"
                            ${isSelf ? 'disabled title="Cannot delete own account"' : ''}>Delete</button>
                </td>`;

            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.admin-view-btn').forEach(btn =>
            btn.addEventListener('click', () => this._loadUserSessions(btn.dataset.username)));

        tbody.querySelectorAll('.admin-del-btn:not([disabled])').forEach(btn =>
            btn.addEventListener('click', () => this._deleteUser(btn.dataset.username)));
    }

    _filterUsers(query) {
        const q = query.toLowerCase();
        this._renderUsers(this._allUsers.filter(u => u.username.toLowerCase().includes(q)));
    }

    

    async _loadSessionCopy(username, sessionName) {
        if (window.SessionManager?.hasUnsavedSessionChanges()) {
            if (!confirm('You have unsaved changes. Load this copy and lose them?')) return;
        }
        try {
            const res  = await fetch(
                `/api/admin/users/${encodeURIComponent(username)}/sessions/${encodeURIComponent(sessionName)}`
            );
            const data = await res.json();
            if (!data.ok || !data.session) { alert('Failed to load session.'); return; }

            window.SessionManager._applyState(data.session);
            window.SessionManager._lastSavedState    = JSON.stringify(data.session);
            window.SessionManager.currentSessionName = null;
            window.SessionManager._updateTopBar();
            window.SessionManager._toast(`Loaded copy of "${sessionName}" (${username}).`);
            this.close();
        } catch (e) {
            alert('Server error. Could not load session.');
        }
    }

    async _deleteUser(username) {
        if (!confirm(`Delete user "${username}" and all their sessions? This cannot be undone.`)) return;
        try {
            const res  = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                window.SessionManager?._toast(`User "${username}" deleted.`);
                this._loadUsers();
            } else {
                alert(data.error || 'Failed to delete user.');
            }
        } catch (e) {
            alert('Server error.');
        }
    }

    

    _showUsersView() {
        document.getElementById('admin-users-view').classList.remove('hidden');
        document.getElementById('admin-sessions-view').classList.add('hidden');
    }

    _showSessionsView() {
        document.getElementById('admin-users-view').classList.add('hidden');
        document.getElementById('admin-sessions-view').classList.remove('hidden');
    }

    

    _setStatus(msg) { document.getElementById('admin-status-msg').textContent = msg; }

    _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    window.authModal          = new AuthModal();
    window.userDropdown       = new UserDropdown();
    window.accountActionModal = new AccountActionModal();
    window.adminModal         = new AdminModal();
});