#!/bin/sh
set -e

# Define paths
SOURCE_DB="/app/prisma/dev.db"
TARGET_DB="/app/data/dev.db"
SEED_MARKER="/app/data/.seed_completed"
VERSION_FILE="/app/data/.app_version"
# Use local Prisma CLI from node_modules
PRISMA_BIN="node /app/node_modules/prisma/build/index.js"

# Get current app version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")

# Fix permissions for data and config directories
chown -R nextjs:nodejs /app/data /app/config

# Check if the persistent database exists
if [ ! -f "$TARGET_DB" ]; then
    echo "[Entrypoint] Initializing database..."
    if [ -f "$SOURCE_DB" ]; then
        echo "[Entrypoint] Copying pre-packaged database from $SOURCE_DB to $TARGET_DB"
        cp "$SOURCE_DB" "$TARGET_DB"
        # Ensure correct permissions
        chown nextjs:nodejs "$TARGET_DB"
        # Mark as seeded since pre-packaged DB includes seed data
        touch "$SEED_MARKER"
        # Record initial version
        echo "$CURRENT_VERSION" > "$VERSION_FILE"
    else
        echo "[Entrypoint] Warning: Source database not found at $SOURCE_DB. Skipping initialization."
    fi
else
    echo "[Entrypoint] Database already exists at $TARGET_DB."
    
    # Check for version upgrade
    PREVIOUS_VERSION=""
    if [ -f "$VERSION_FILE" ]; then
        PREVIOUS_VERSION=$(cat "$VERSION_FILE")
    fi
    
    # Run migrations to ensure DB schema is up to date with new code version
    echo "[Entrypoint] Running database migrations to sync schema..."
    cd /app && $PRISMA_BIN migrate deploy --schema=./prisma/schema.prisma && {
        echo "[Entrypoint] Migrations completed successfully."
        
        # Note: seed is NOT run here because:
        # - New installs: pre-packaged DB already contains seed data
        # - Upgrades: admin user already exists, tags are rebuilt by rebuild-system-tags.js
        
        # Check if version changed - rebuild system tags automatically
        if [ "$PREVIOUS_VERSION" != "$CURRENT_VERSION" ]; then
            echo "[Entrypoint] Version upgrade detected: $PREVIOUS_VERSION -> $CURRENT_VERSION"
            echo "[Entrypoint] Rebuilding system tags to sync with new version..."
            cd /app && node ./dist-scripts/scripts/rebuild-system-tags.js && {
                echo "[Entrypoint] System tags rebuilt successfully."
            } || echo "[Entrypoint] Tag rebuild failed (non-fatal, continuing...)."
            # Update version marker
            echo "$CURRENT_VERSION" > "$VERSION_FILE"
        fi
    } || echo "[Entrypoint] Migration failed or no pending migrations."
fi

# HTTPS Setup
CERT_DIR="/app/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

if [ "$HTTPS_ENABLED" = "true" ]; then
    echo "[Entrypoint] HTTPS enabled"
    
    # 确保证书目录存在
    mkdir -p "$CERT_DIR"
    chown nextjs:nodejs "$CERT_DIR"
    
    # 检查证书是否存在
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        echo "[Entrypoint] 证书不存在，自动生成自签名证书..."
        
        # 获取证书 CN（优先使用环境变量，否则使用 localhost）
        CERT_CN="${CERT_DOMAIN:-localhost}"
        
        # 生成自签名证书（有效期 10 年）
        openssl req -x509 -newkey rsa:2048 \
            -keyout "$KEY_FILE" \
            -out "$CERT_FILE" \
            -days 3650 \
            -nodes \
            -subj "/CN=$CERT_CN" \
            2>/dev/null
        
        if [ $? -eq 0 ]; then
            echo "[Entrypoint] 自签名证书生成成功: CN=$CERT_CN"
            chown nextjs:nodejs "$CERT_FILE" "$KEY_FILE"
        else
            echo "[Entrypoint] 警告: 证书生成失败，HTTPS 将不可用"
        fi
    else
        echo "[Entrypoint] 使用已有证书: $CERT_FILE"
    fi
    
    # 启动 HTTPS 代理
    if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
        echo "[Entrypoint] 启动 HTTPS 代理 (端口 443)..."
        su-exec nextjs:nodejs node /app/https-server.js &
    fi
fi

# Execute the main container command as nextjs user
exec su-exec nextjs:nodejs "$@"
