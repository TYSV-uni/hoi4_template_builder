require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcrypt');
const path     = require('path');
const cookieParser = require('cookie-parser');
const { pool, initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cookieParser());

app.get('/weather.html', (req, res) => {
    const React = require('react');
    const ReactDOMServer = require('react-dom/server');

    const username = req.cookies.username || null;
    const now = new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });

    const WeatherPage = () => {
        return React.createElement('html', { lang: 'en' },
            React.createElement('head', null,
                React.createElement('meta', { charSet: 'UTF-8' }),
                React.createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
                React.createElement('title', null, 'Weather Intel — Tech Tree'),
                React.createElement('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
                React.createElement('link', { href: 'https://fonts.googleapis.com/css2?family=Special+Elite&family=Share+Tech+Mono&display=swap', rel: 'stylesheet' }),
                React.createElement('link', { rel: 'stylesheet', href: 'css/weather.css' }),
                React.createElement('link', {rel: "icon", href: "/media/favicon.ico"}),
                React.createElement('script', { crossOrigin: 'anonymous', src: 'https://unpkg.com/react@18/umd/react.development.js' }),
                React.createElement('script', { crossOrigin: 'anonymous', src: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js' }),
                React.createElement('script', { crossOrigin: 'anonymous', src: 'https://unpkg.com/react-router-dom@5/umd/react-router-dom.min.js' }),
                React.createElement('script', { src: 'https://unpkg.com/@babel/standalone/babel.min.js' })
            ),
            React.createElement('body', null,
                React.createElement('div', { id: 'top-bar' },
                    React.createElement('a', { href: 'index.html' }, '← Tech Tree'),
                    React.createElement('span', null, '/ Weather Intel')
                ),
                React.createElement('div', { id: 'app-root' },
                    React.createElement('div', { className: 'paper' },
                        React.createElement('div', { className: 'stamp' }, 'Intel Report'),
                        React.createElement('div', { className: 'report-header' },
                            React.createElement('h1', null, '⛅ Weather Intelligence'),
                            React.createElement('div', { className: 'subtitle' }, `Meteorological Analysis Division · ${now}`),
                            username ? React.createElement('div', { className: 'subtitle', style: { color: '#6b7a38', fontWeight: 'bold' } }, `Authorized Operative: ${username}`) : null
                        ),
                        React.createElement('div', { id: 'weather-client-root' }),
                        React.createElement('div', { className: 'report-footer' },
                            'Data: Open-Meteo (open-meteo.com) · Geocoding: OpenStreetMap Nominatim · No API key required'
                        )
                    )
                ),
                React.createElement('script', { type: 'text/babel', src: 'js/weather.js' })
            )
        );
    };

    const html = '<!DOCTYPE html>\n' + ReactDOMServer.renderToString(React.createElement(WeatherPage));
    res.send(html);
});

app.use(express.static(path.join(__dirname, '../public')));

async function requireAdmin(req, res, next) {
    const username = req.cookies.username;
    if (!username) return res.json({ ok: false, error: 'Authentication required' });

    try {
        const result = await pool.query(
            'SELECT role FROM users WHERE username = $1', [username]
        );
        if (result.rows.length === 0 || result.rows[0].role !== 'admin')
            return res.json({ ok: false, error: 'Admin access required' });
        req.adminUsername = username;
        next();
    } catch (err) {
        res.json({ ok: false, error: 'Server error' });
    }
}

app.post('/api/users', async (req, res) => {
    const { username, password } = req.body;

    if (!username || username.length < 3)
        return res.json({ ok: false, error: 'Username: minimum 3 characters' });
    if (!password || password.length < 6)
        return res.json({ ok: false, error: 'Password: minimum 6 characters' });

    try {
        const existing = await pool.query(
            'SELECT 1 FROM users WHERE username = $1', [username]
        );
        if (existing.rows.length > 0)
            return res.json({ ok: false, error: 'This username is already taken' });

        const password_hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
            [username, password_hash]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Register error:', err);
        res.json({ ok: false, error: 'Server error, please try again' });
    }
});

app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.json({ ok: false, error: 'Please fill in all fields' });

    try {
        const result = await pool.query(
            'SELECT password_hash, role FROM users WHERE username = $1', [username]
        );
        if (result.rows.length === 0)
            return res.json({ ok: false, error: 'Invalid username or password' });

        const match = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!match)
            return res.json({ ok: false, error: 'Invalid username or password' });

        res.cookie('username', username, { maxAge: 24 * 60 * 60 * 1000, httpOnly: false });
        res.json({ ok: true, role: result.rows[0].role });
    } catch (err) {
        console.error('Login error:', err);
        res.json({ ok: false, error: 'Server error, please try again' });
    }
});

app.put('/api/users/:username/password', async (req, res) => {
    const { username } = req.params;
    const { newPassword } = req.body;

    if (req.cookies.username !== username)
        return res.json({ ok: false, error: 'Unauthorized' });

    if (!newPassword)
        return res.json({ ok: false, error: 'Missing fields' });
    if (newPassword.length < 6)
        return res.json({ ok: false, error: 'Password: minimum 6 characters' });

    try {
        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2',
            [newHash, username]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Password change error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    const { password } = req.body;

    if (req.cookies.username !== username)
        return res.json({ ok: false, error: 'Unauthorized' });
    if (!password)
        return res.json({ ok: false, error: 'Password required' });

    try {
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE username = $1', [username]
        );
        if (result.rows.length === 0)
            return res.json({ ok: false, error: 'User not found' });

        const match = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!match)
            return res.json({ ok: false, error: 'Incorrect password' });

        
        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        res.clearCookie('username');
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete account error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/users/:username/sessions', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query(
            'SELECT name, updated_at, share_id FROM sessions WHERE username = $1 ORDER BY updated_at DESC',
            [username]
        );
        res.json({ ok: true, sessions: result.rows });
    } catch (err) {
        console.error('Session list error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/users/:username/sessions/:name', async (req, res) => {
    const { username, name } = req.params;
    try {
        const result = await pool.query(
            'SELECT session_data, share_id FROM sessions WHERE username = $1 AND name = $2',
            [username, name]
        );
        if (result.rows.length === 0)
            return res.json({ ok: false, error: 'Session not found' });
        res.json({ ok: true, session: result.rows[0].session_data, share_id: result.rows[0].share_id });
    } catch (err) {
        console.error('Session load error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.post('/api/users/:username/sessions', async (req, res) => {
    const { username } = req.params;
    const { name, session } = req.body;

    if (!name || !session)
        return res.json({ ok: false, error: 'Missing data' });

    try {
        const existing = await pool.query(
            'SELECT 1 FROM sessions WHERE username = $1 AND name = $2',
            [username, name]
        );
        if (existing.rows.length > 0)
            return res.json({ ok: false, error: 'A session with that name already exists' });

        await pool.query(
            'INSERT INTO sessions (username, name, session_data, updated_at) VALUES ($1, $2, $3, NOW())',
            [username, name, session]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Session create error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.put('/api/users/:username/sessions/:name', async (req, res) => {
    const { username, name } = req.params;
    const { session } = req.body;

    if (!session)
        return res.json({ ok: false, error: 'Missing session data' });

    try {
        await pool.query(
            'UPDATE sessions SET session_data = $1, updated_at = NOW() WHERE username = $2 AND name = $3',
            [session, username, name]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Session overwrite error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.delete('/api/users/:username/sessions/:name', async (req, res) => {
    const { username, name } = req.params;
    try {
        await pool.query(
            'DELETE FROM sessions WHERE username = $1 AND name = $2',
            [username, name]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Session delete error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.patch('/api/users/:username/sessions/:name', async (req, res) => {
    const { username, name } = req.params;
    const { newName } = req.body;

    if (!newName || !newName.trim())
        return res.json({ ok: false, error: 'Name cannot be empty' });

    const trimmed = newName.trim();
    if (trimmed === name) return res.json({ ok: true });

    try {
        const existing = await pool.query(
            'SELECT 1 FROM sessions WHERE username = $1 AND name = $2',
            [username, trimmed]
        );
        if (existing.rows.length > 0)
            return res.json({ ok: false, error: 'A session with that name already exists' });

        await pool.query(
            'UPDATE sessions SET name = $1 WHERE username = $2 AND name = $3',
            [trimmed, username, name]
        );
        res.json({ ok: true, newName: trimmed });
    } catch (err) {
        console.error('Session rename error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/sessions/ref/:share_id', async (req, res) => {
    const { share_id } = req.params;
    try {
        const result = await pool.query(
            'SELECT session_data, name FROM sessions WHERE share_id = $1',
            [share_id]
        );
        if (result.rows.length === 0)
            return res.json({ ok: false, error: 'Share link not found or session was deleted' });
        res.json({ ok: true, session: result.rows[0].session_data, name: result.rows[0].name });
    } catch (err) {
        console.error('Ref share fetch error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.username, u.role, COUNT(s.id)::int AS session_count
            FROM users u
            LEFT JOIN sessions s ON s.username = u.username
            GROUP BY u.username, u.role
            ORDER BY u.username ASC
        `);
        res.json({ ok: true, users: result.rows });
    } catch (err) {
        console.error('Admin users list error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/admin/users/:username/sessions', requireAdmin, async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query(
            'SELECT name, updated_at FROM sessions WHERE username = $1 ORDER BY updated_at DESC',
            [username]
        );
        res.json({ ok: true, sessions: result.rows });
    } catch (err) {
        res.json({ ok: false, error: 'Server error' });
    }
});

app.get('/api/admin/users/:username/sessions/:name', requireAdmin, async (req, res) => {
    const { username, name } = req.params;
    try {
        const result = await pool.query(
            'SELECT session_data FROM sessions WHERE username = $1 AND name = $2',
            [username, name]
        );
        if (result.rows.length === 0)
            return res.json({ ok: false, error: 'Session not found' });
        res.json({ ok: true, session: result.rows[0].session_data });
    } catch (err) {
        res.json({ ok: false, error: 'Server error' });
    }
});

app.delete('/api/admin/users/:username', requireAdmin, async (req, res) => {
    const { username } = req.params;

    if (username === req.adminUsername)
        return res.json({ ok: false, error: 'Cannot delete your own admin account' });

    try {
        const result = await pool.query(
            'DELETE FROM users WHERE username = $1 RETURNING username', [username]
        );
        if (result.rowCount === 0)
            return res.json({ ok: false, error: 'User not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('Admin delete user error:', err);
        res.json({ ok: false, error: 'Server error' });
    }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});