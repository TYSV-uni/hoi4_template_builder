const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST,
    port:     process.env.PG_PORT,
    database: process.env.PG_DB,
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                username      TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'user'
            );

            -- Add role to existing installs that pre-date this column
            ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

            CREATE TABLE IF NOT EXISTS sessions (
                id           SERIAL PRIMARY KEY,
                username     TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
                name         TEXT NOT NULL,
                session_data JSONB NOT NULL,
                -- share_id is a stable public token that identifies this session without
                -- exposing the owner's username. Used for live/auto-update share links.
                share_id     TEXT UNIQUE DEFAULT gen_random_uuid()::text,
                updated_at   TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(username, name)
            );

            -- Add share_id to existing installs that pre-date this column
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE DEFAULT gen_random_uuid()::text;
        `);
        console.log('Database ready.');
    } catch (err) {
        console.error('Error connecting to the database:', err.message);
    }
}

module.exports = { pool, initDB };