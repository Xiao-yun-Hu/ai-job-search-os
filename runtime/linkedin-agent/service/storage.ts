import fs from "fs";
import path from "path";
import os from "os";

const DIR = path.join(os.homedir(), ".job-search");

export function appendResult(data: object) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(
    path.join(DIR, "results.jsonl"),
    JSON.stringify({ ...data, savedAt: new Date().toISOString() }) + "\n",
  );
}

export function appendApplication(data: object) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(
    path.join(DIR, "applications.jsonl"),
    JSON.stringify({ ...data, appliedAt: new Date().toISOString() }) + "\n",
  );
}
