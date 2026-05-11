#!/bin/sh
set -e

DB=/data/hits.db

for file in /data/logs/access.log /data/logs/access.log.*; do
    [ -f "$file" ] || continue

    size_before=$(stat -c%s "$file" 2>/dev/null) || continue
    offset=$(sqlite3 "$DB" "SELECT COALESCE((SELECT offset FROM cursor WHERE filename='$file'), 0);")
    bytes_to_read=$((size_before - offset))

    [ "$bytes_to_read" -le 0 ] && continue

    tail -c "+$((offset + 1))" "$file" | head -c "$bytes_to_read" | awk '
    BEGIN { print "BEGIN;" }
    /^[0-9]/ {
        ts = $1; status = $2; uri = $3
        gsub(/"/, "", uri)
        sub(/\?.*/, "", uri)
        if (uri == "" || length(ts) < 16) next
        date = substr(ts, 1, 10)
        hour = substr(ts, 12, 2) + 0
        gsub(/'"'"'/, "'"'"''"'"'", uri)
        printf "INSERT INTO hits(date,hour,path,status,count) VALUES('"'"'%s'"'"',%d,'"'"'%s'"'"',%d,1) ON CONFLICT(date,hour,path,status) DO UPDATE SET count=count+1;\n", date, hour, uri, status+0
    }
    END { print "COMMIT;" }' | sqlite3 "$DB"

    sqlite3 "$DB" "INSERT OR REPLACE INTO cursor(filename,offset) VALUES('$file',$size_before);"
done
