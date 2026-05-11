#!/bin/sh
set -e

mkdir -p /data/logs

if [ ! -f /data/hits.db ]; then
    sqlite3 /data/hits.db "
        CREATE TABLE hits (
            date TEXT NOT NULL,
            hour INTEGER NOT NULL,
            path TEXT NOT NULL,
            status INTEGER NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date, hour, path, status)
        ) WITHOUT ROWID;
        CREATE TABLE cursor (
            filename TEXT PRIMARY KEY,
            offset INTEGER NOT NULL DEFAULT 0
        );
    "
fi

cat > /etc/crontabs/root << 'EOF'
0 * * * * /usr/local/bin/aggregate-hits.sh >> /data/logs/aggregate.log 2>&1
5 0 * * * /usr/local/bin/rotate-logs.sh >> /data/logs/rotate.log 2>&1
EOF

crond -l 8

exec nginx -g 'daemon off;'
