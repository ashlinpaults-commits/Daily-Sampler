/**
 * Sampler 3.0 Safe Migration from Legacy Storage
 * 
 * Migrates n1TicketHistoryV1 and worksheetLibraryV1 to compact format.
 */

import samplerStorage from "./sampler-storage.js";

const MIGRATION_STATE_KEY = "samplerV3_migrationState";
const LEGACY_KEYS = {
  TICKET_HISTORY: "n1TicketHistoryV1",
  WORKSHEET_LIBRARY: "worksheetLibraryV1",
};

const EXTRACTION_CONFIG = {
  ticketId: ["ticketId", "ticket_id", "id"],
  date: ["date", "created_at", "createdDate"],
  agent: ["agent", "assignee", "agent_name"],
  channel: ["channel", "support_channel", "type"],
  misses: ["misses", "issues", "checks"],
};

class SamplerMigration {
  constructor() {
    this.log = [];
    this.stats = { processed: 0, converted: 0, skipped: 0, errors: 0 };
  }

  detectLegacyStorage() {
    const found = [];
    Object.entries(LEGACY_KEYS).forEach(([name, key]) => {
      if (localStorage.getItem(key)) {
        found.push({ name, key });
      }
    });
    return found;
  }

  async runMigration() {
    console.log("[Sampler Migration] Starting migration...");

    const state = this.getMigrationState();
    if (state && state.completed) {
      console.log("[Sampler Migration] Already migrated on", state.completedAt);
      return { status: "already_completed", details: state };
    }

    this.log = [];
    this.stats = { processed: 0, converted: 0, skipped: 0, errors: 0 };

    try {
      const legacy = this.detectLegacyStorage();
      if (legacy.length === 0) {
        this.addLog("No legacy storage detected");
        return { status: "no_legacy_data" };
      }

      this.addLog(`Found ${legacy.length} legacy keys`);

      const extracted = [];
      for (const { name, key } of legacy) {
        const data = this.extractFromLegacy(key);
        extracted.push(...data);
      }

      this.addLog(`Extracted ${extracted.length} records`);

      const converted = extracted
        .map((record) => this.convertToCompact(record))
        .filter(Boolean);

      this.addLog(`Converted ${converted.length} records`);

      const verified = this.verifyConversion(converted);
      this.addLog(`Verified ${verified.length} records`);

      if (verified.length === 0) {
        throw new Error("No valid records after conversion");
      }

      this.saveConvertedData(verified);
      this.addLog(`Saved ${verified.length} records`);

      const saved = samplerStorage.getSampledTickets();
      if (saved.length === 0) {
        throw new Error("New storage appears empty");
      }

      this.addLog(`Verification passed: ${saved.length} readable`);

      this.removeLegacyStorage();
      this.addLog("Legacy storage removed");

      this.setMigrationState({ completed: true, completedAt: new Date().toISOString() });

      const result = {
        status: "success",
        summary: this.stats,
        details: this.log,
      };

      console.log("[Sampler Migration] Complete:", result);
      return result;
    } catch (error) {
      this.addLog(`ERROR: ${error.message}`, "error");
      console.error("[Sampler Migration] Failed:", error);
      return {
        status: "failed",
        error: error.message,
        summary: this.stats,
        details: this.log,
        note: "Legacy storage preserved",
      };
    }
  }

  extractFromLegacy(storageKey) {
    const extracted = [];

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return extracted;

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        this.addLog(`Failed to parse ${storageKey}`, "warning");
        return extracted;
      }

      if (Array.isArray(data)) {
        extracted.push(...data);
      } else if (data && typeof data === "object") {
        if (data.tickets) extracted.push(...data.tickets);
        else if (data.data) extracted.push(...(Array.isArray(data.data) ? data.data : [data.data]));
        else extracted.push(data);
      }

      this.stats.processed += extracted.length;
      return extracted;
    } catch (error) {
      this.addLog(`Error extracting from ${storageKey}: ${error.message}`, "error");
      this.stats.errors += 1;
      return extracted;
    }
  }

  convertToCompact(record) {
    try {
      if (!record || typeof record !== "object") {
        return null;
      }

      const ticketId = this.extractField(record, EXTRACTION_CONFIG.ticketId);
      const date = this.extractField(record, EXTRACTION_CONFIG.date);
      const agent = this.extractField(record, EXTRACTION_CONFIG.agent);
      const channel = this.extractField(record, EXTRACTION_CONFIG.channel);
      let misses = this.extractField(record, EXTRACTION_CONFIG.misses);

      if (!ticketId || !date || !agent || !channel) {
        this.stats.skipped += 1;
        return null;
      }

      if (!Array.isArray(misses)) {
        if (misses && typeof misses === "object") {
          misses = Object.keys(misses);
        } else if (typeof misses === "string") {
          misses = [misses];
        } else {
          misses = [];
        }
      }

      const compact = {
        date: this.normalizeDate(date),
        ticketId: String(ticketId),
        agent: String(agent),
        channel: String(channel),
        misses: misses.map(String),
        sampledAt: new Date().toISOString(),
        migratedFrom: "legacy_storage",
      };

      this.stats.converted += 1;
      return compact;
    } catch (error) {
      this.addLog(`Error converting: ${error.message}`, "error");
      this.stats.errors += 1;
      return null;
    }
  }

  extractField(record, possibleKeys) {
    for (const key of possibleKeys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
      const lowerKey = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
      if (lowerKey) {
        return record[lowerKey];
      }
    }
    return null;
  }

  normalizeDate(value) {
    if (!value) return "";

    let date;
    if (typeof value === "string") {
      if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
        date = new Date(value);
      } else if (value.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
        const [m, d, y] = value.split("/");
        date = new Date(y, m - 1, d);
      } else {
        date = new Date(value);
      }
    } else if (typeof value === "number") {
      date = new Date(value);
    } else if (value instanceof Date) {
      date = value;
    } else {
      return "";
    }

    if (isNaN(date)) return "";

    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
  }

  verifyConversion(records) {
    return records.filter((record) => {
      return (
        record.date &&
        record.ticketId &&
        record.agent &&
        record.channel &&
        Array.isArray(record.misses)
      );
    });
  }

  saveConvertedData(records) {
    try {
      const existing = samplerStorage.getSampledTickets();
      const all = [...existing, ...records];

      const seen = new Set();
      const deduped = [];
      all.forEach((record) => {
        const key = `${record.date}|${record.channel}|${record.ticketId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(record);
        }
      });

      localStorage.setItem(
        "samplerV3_sampledTickets",
        JSON.stringify(deduped)
      );

      this.addLog(`Saved ${deduped.length} total (deduped from ${all.length})`);
      return true;
    } catch (error) {
      throw new Error(`Failed to save: ${error.message}`);
    }
  }

  removeLegacyStorage() {
    Object.values(LEGACY_KEYS).forEach((key) => {
      localStorage.removeItem(key);
      this.addLog(`Removed ${key}`);
    });
  }

  getMigrationState() {
    try {
      const state = localStorage.getItem(MIGRATION_STATE_KEY);
      return state ? JSON.parse(state) : null;
    } catch {
      return null;
    }
  }

  setMigrationState(state) {
    localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(state));
  }

  addLog(message, level = "info") {
    const timestamp = new Date().toISOString();
    this.log.push({ timestamp, level, message });
  }

  checkIfSafeToMigrate() {
    const legacy = this.detectLegacyStorage();
    const currentData = samplerStorage.getSampledTickets();

    return {
      hasMigrated: !!this.getMigrationState()?.completed,
      hasLegacyData: legacy.length > 0,
      legacyKeys: legacy.map((l) => l.key),
      currentDataCount: currentData.length,
      recommendation: !this.getMigrationState()?.completed && legacy.length > 0
        ? "Ready to migrate"
        : this.getMigrationState()?.completed
        ? "Already migrated"
        : "No legacy data",
    };
  }

  exportReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      log: this.log,
      state: this.getMigrationState(),
    };
  }
}

const samplerMigration = new SamplerMigration();

export default samplerMigration;