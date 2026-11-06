'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SECRET_FILE = '.nextauth_secret';
const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const FAILURE_MESSAGE = 'Unable to initialize persisted NEXTAUTH_SECRET; check data-directory permissions and secret-file integrity.';

function readPersistedSecret(secretPath) {
    let before;
    try {
        before = fs.lstatSync(secretPath);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
    if (!before.isFile()) throw new Error(FAILURE_MESSAGE);

    // NOFOLLOW rejects symlink swaps; NONBLOCK prevents a FIFO swap from hanging.
    const fd = fs.openSync(secretPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== 64) {
            throw new Error(FAILURE_MESSAGE);
        }
        // Bound the read even if another process corrupts/grows the existing file.
        // Loop because network/FUSE filesystems may legally return a short read.
        const buffer = Buffer.alloc(65);
        let offset = 0;
        while (offset < buffer.length) {
            const length = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
            if (length === 0) break;
            offset += length;
        }
        const secret = buffer.toString('utf8', 0, offset);
        if (offset !== 64 || !SECRET_PATTERN.test(secret)) throw new Error(FAILURE_MESSAGE);

        if ((stat.mode & 0o7777) !== 0o600) {
            fs.fchmodSync(fd, 0o600);
            fs.fsyncSync(fd);
        }
        const current = fs.lstatSync(secretPath);
        if (!current.isFile() || current.dev !== stat.dev || current.ino !== stat.ino ||
            current.size !== 64 || (fs.fstatSync(fd).mode & 0o7777) !== 0o600) {
            throw new Error(FAILURE_MESSAGE);
        }
        return secret;
    } finally {
        fs.closeSync(fd);
    }
}

function syncDirectory(dataDir) {
    const fd = fs.openSync(dataDir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Preserve an explicit value verbatim, or reuse one private, persistent secret.
 * Generated files contain exactly 64 lowercase hex characters (32 random bytes).
 */
function ensureAuthSecret({ dataDir = '/app/data', env = process.env } = {}) {
    const explicit = env.NEXTAUTH_SECRET;
    if (typeof explicit === 'string' && explicit.length > 0) return explicit;

    try {
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
        const secretPath = path.join(dataDir, SECRET_FILE);
        const existing = readPersistedSecret(secretPath);
        if (existing !== null) return existing;

        const temporaryPath = path.join(dataDir,
            `${SECRET_FILE}.${process.pid}.${crypto.randomBytes(16).toString('hex')}.tmp`);
        let fd;
        let created = false;
        try {
            fd = fs.openSync(temporaryPath, 'wx', 0o600);
            created = true;
            // Set exact permissions even when umask removes owner permissions.
            fs.fchmodSync(fd, 0o600);
            fs.writeFileSync(fd, crypto.randomBytes(32).toString('hex'), 'utf8');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;

            try {
                // Publish the complete inode exclusively; never replace a winner.
                fs.linkSync(temporaryPath, secretPath);
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }
            const winner = readPersistedSecret(secretPath);
            if (winner === null) throw new Error(FAILURE_MESSAGE);
            return winner;
        } finally {
            try {
                if (fd !== undefined) fs.closeSync(fd);
            } finally {
                if (created) {
                    fs.unlinkSync(temporaryPath);
                    // Make the published name and temporary-file removal durable.
                    syncDirectory(dataDir);
                }
            }
        }
    } catch {
        // Never include file contents, environment values or raw errors in logs.
        throw new Error(FAILURE_MESSAGE);
    }
}

if (require.main === module) {
    try {
        // An optional data-directory argument keeps CLI checks isolated from /app.
        process.stdout.write(ensureAuthSecret({ dataDir: process.argv[2] }));
    } catch {
        process.stderr.write(`[Auth secret] ${FAILURE_MESSAGE}\n`);
        process.exitCode = 1;
    }
}

module.exports = { ensureAuthSecret };
