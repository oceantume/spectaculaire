import { execSync } from "node:child_process";
import type { ChangeDetail, ChangelogCommit, FestivalChangelog, Row, ScheduleChange } from "../types";

type ShowKey = string;

function git(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function getScheduleAtCommit(hash: string, dataDir: string): Row[] {
  for (const base of ["src/data/festivals", "src/content/festivals"]) {
    try {
      return JSON.parse(git(`git show ${hash}:${base}/${dataDir}/schedule.json`)) as Row[];
    } catch {}
  }
  return [];
}

function showKey(row: Row): ShowKey {
  return `${row.artist.trim().toLowerCase()}|${row.date}`;
}

function getChangedFields(oldRow: Row, newRow: Row): ChangeDetail[] {
  const details: ChangeDetail[] = [];
  if (oldRow.time !== newRow.time) details.push({ field: "time", from: oldRow.time, to: newRow.time });
  if (oldRow.venue !== newRow.venue) details.push({ field: "venue", from: oldRow.venue, to: newRow.venue });
  if (oldRow.paid !== newRow.paid) details.push({ field: "paid", from: String(oldRow.paid), to: String(newRow.paid) });
  return details;
}

function diffSchedules(oldRows: Row[], newRows: Row[]): ScheduleChange[] {
  const oldMap = new Map<ShowKey, Row[]>();
  const newMap = new Map<ShowKey, Row[]>();

  for (const row of oldRows) {
    const key = showKey(row);
    const list = oldMap.get(key) ?? [];
    list.push(row);
    oldMap.set(key, list);
  }
  for (const row of newRows) {
    const key = showKey(row);
    const list = newMap.get(key) ?? [];
    list.push(row);
    newMap.set(key, list);
  }

  const changes: ScheduleChange[] = [];

  for (const [key, oldRowList] of oldMap) {
    const newRowList = newMap.get(key);
    if (!newRowList) {
      for (const row of oldRowList) {
        changes.push({ type: "removed", artist: row.artist.trim(), showDate: row.date, time: row.time });
      }
    } else {
      const sortedOld = [...oldRowList].sort((a, b) => a.time.localeCompare(b.time));
      const sortedNew = [...newRowList].sort((a, b) => a.time.localeCompare(b.time));
      const minLen = Math.min(sortedOld.length, sortedNew.length);
      for (let i = 0; i < minLen; i++) {
        const details = getChangedFields(sortedOld[i], sortedNew[i]);
        if (details.length > 0) {
          changes.push({ type: "updated", artist: sortedOld[i].artist, showDate: sortedOld[i].date, details });
        }
      }
      for (let i = minLen; i < sortedOld.length; i++) {
        changes.push({
          type: "removed",
          artist: sortedOld[i].artist,
          showDate: sortedOld[i].date,
          time: sortedOld[i].time,
        });
      }
      for (let i = minLen; i < sortedNew.length; i++) {
        changes.push({
          type: "added",
          artist: sortedNew[i].artist,
          showDate: sortedNew[i].date,
          time: sortedNew[i].time,
        });
      }
    }
  }

  for (const [key, newRowList] of newMap) {
    if (!oldMap.has(key)) {
      for (const row of newRowList) {
        changes.push({ type: "added", artist: row.artist.trim(), showDate: row.date, time: row.time });
      }
    }
  }

  return changes;
}

export function getFestivalChangelog(dataDir: string): FestivalChangelog {
  const filePath = `src/data/festivals/${dataDir}/schedule.json`;

  let logOutput: string;
  try {
    logOutput = git(`git log --follow --reverse --format="%H %aI %s" -- ${filePath}`);
  } catch {
    return [];
  }

  if (!logOutput) return [];

  const commits = logOutput.split("\n").map((line) => {
    const firstSpace = line.indexOf(" ");
    const secondSpace = line.indexOf(" ", firstSpace + 1);
    return {
      hash: line.slice(0, firstSpace),
      date: line.slice(firstSpace + 1, secondSpace),
      automated: line.slice(secondSpace + 1) === "Automatically update festival data",
    };
  });

  const changelog: ChangelogCommit[] = [];

  for (let i = 1; i < commits.length; i++) {
    const { hash, date, automated } = commits[i];
    if (!automated) continue;
    const newRows = getScheduleAtCommit(hash, dataDir);
    const oldRows = getScheduleAtCommit(commits[i - 1].hash, dataDir);
    const changes = diffSchedules(oldRows, newRows);
    if (changes.length > 0) {
      changelog.push({ hash, date, changes });
    }
  }

  changelog.reverse();
  return changelog;
}
