/**
 * Sampler 3.0 Storage Layer - Compact, Bounded, Quota-Aware
 * 
 * Core principle: Store ONLY what auditors actually sample, minimally.
 * Raw N-1 workbooks stay in temporary runtime memory only.
 * Historical persistence is intelligence, not raw data.
 */

const SAMPLER_STORAGE_VERSION = "3.0";
const STORAGE_KEYS = {
  SAMPLED_TICKETS: "samplerV3_sampledTickets",
  MISS_INTELLIGENCE: "samplerV3_missIntelligence",
  STORAGE_METADATA: "samplerV3_metadata",
  MIGRATION_STATE: "samplerV3_migrationState",
};

const STORAGE_WARNING_THRESHOLD = 4 * 1024 * 1024; // 4MB
const STORAGE_PRUNE_TARGET = 2 * 1024 * 1024; // 2MB after pruning

class SamplerStorage {
  constructor() {
    this.initialized = false;
    this.quotaExceededHandlers = [];
    this.init();
  }

  init() {
    try {
      const testKey = "_sampler_test_" + Date.now();
      localStorage.setItem(testKey, "test");
      localStorage.removeItem(testKey);
      this.initialized = true;
      this.detectLegacyStorage();
    } catch (error) {
      console.error("[Sampler Storage] Failed to initialize:", error.message);
      this.initialized = false;
    }
  }

  detectLegacyStorage() {
    const legacyKeys = ["n1TicketHistoryV1", "worksheetLibraryV1"];
    const found = legacyKeys.filter((key) => localStorage.getItem(key));
    if (found.length > 0) {
      console.warn("[Sampler Storage] Legacy storage detected:", found);
    }
  }

  persistSampledTicket(ticket) {
    if (!this.initialized) {
      console.warn("[Sampler Storage] Storage not initialized");
      return false;
    }
    if (!ticket || !ticket.ticketId) {
      console.error("[Sampler Storage] Invalid ticket");
      return false;
    }

    try {
      const compactRecord = this.buildCompactRecord(ticket);
      let sampledTickets = this.getSampledTickets();
      const dedup_key = `${compactRecord.date}|${compactRecord.channel}|${compactRecord.ticketId}`;
      const existingIndex = sampledTickets.findIndex(
        (t) => `${t.date}|${t.channel}|${t.ticketId}` === dedup_key
      );

      if (existingIndex >= 0) {
        sampledTickets[existingIndex] = this.mergeMissData(
          sampledTickets[existingIndex],
          compactRecord
        );
      } else {
        sampledTickets.push(compactRecord);
      }

      localStorage.setItem(STORAGE_KEYS.SAMPLED_TICKETS, JSON.stringify(sampledTickets));
      this.checkAndPruneIfNeeded();
      return true;
    } catch (error) {
      if (error.name === "QuotaExceededError") {
        console.error("[Sampler Storage] Quota exceeded");
        this.handleQuotaExceeded();
        return false;
      }
      console.error("[Sampler Storage] Error persisting:", error.message);
      return false;
    }
  }

  buildCompactRecord(ticket) {
    const misses = this.extractMisses(ticket.checks, ticket.tags);
    return {
      date: ticket.date || "",
      ticketId: ticket.ticketId || "",
      agent: ticket.agent || "",
      channel: ticket.channel || "",
      misses: misses,
      sampledAt: new Date().toISOString(),
    };
  }

  extractMisses(checks, tags) {
    const misses = [];
    if (!checks) return misses;

    const missMap = {
      "Jira Required": "jira_missing",
      "Low CSAT": "low_csat",
      "Blank Module": "blank_module",
      "Blank Feature": "blank_feature",
      "Blank Organization": "blank_organization",
      "Header Issue": "header_issue",
      "Duration Mismatch": "duration_mismatch",
      "Suspicious Call": "suspicious_call",
      "Status requires Hold Reason": "status_hold_missing",
    };

    checks.forEach((check) => {
      if (check.active && missMap[check.label]) {
        misses.push(missMap[check.label]);
      }
    });

    return [...new Set(misses)];
  }

  mergeMissData(existing, updated) {
    return {
      ...existing,
      misses: [...new Set([...existing.misses, ...updated.misses])],
      sampledAt: updated.sampledAt,
    };
  }

  getSampledTickets() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAMPLED_TICKETS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[Sampler Storage] Error reading:", error.message);
      return [];
    }
  }

  queryMissesByDateRange(startDate, endDate, filters = {}) {
    const sampledTickets = this.getSampledTickets();
    const start = new Date(startDate);
    const end = new Date(endDate);

    return sampledTickets.filter((ticket) => {
      const [m, d, y] = ticket.date.split("/");
      const ticketDate = new Date(y, m - 1, d);
      const inRange = ticketDate >= start && ticketDate <= end;
      const matchesAgent = !filters.agent || ticket.agent === filters.agent;
      const matchesChannel = !filters.channel || ticket.channel === filters.channel;
      const matchesMiss = !filters.missType || ticket.misses.includes(filters.missType);
      return inRange && matchesAgent && matchesChannel && matchesMiss;
    });
  }

  getAnalyticsSummary(startDate, endDate, agent = null) {
    const filtered = this.queryMissesByDateRange(startDate, endDate, { agent });
    const summary = {
      sampledCount: filtered.length,
      byMissType: {},
      byChannel: {},
      ticketIds: [],
    };

    filtered.forEach((ticket) => {
      ticket.misses.forEach((miss) => {
        summary.byMissType[miss] = (summary.byMissType[miss] || 0) + 1;
      });
      summary.byChannel[ticket.channel] = (summary.byChannel[ticket.channel] || 0) + 1;
      if (!summary.ticketIds.includes(ticket.ticketId)) {
        summary.ticketIds.push(ticket.ticketId);
      }
    });

    return summary;
  }

  getStorageStatus() {
    try {
      let totalSize = 0;
      const breakdown = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("samplerV3_")) {
          const size = localStorage.getItem(key).length;
          totalSize += size;
          breakdown[key] = size;
        }
      }

      return {
        totalBytes: totalSize,
        totalKB: (totalSize / 1024).toFixed(2),
        breakdown: breakdown,
        warningLevel: totalSize > STORAGE_WARNING_THRESHOLD,
        estimatedRecordsCount: this.getSampledTickets().length,
      };
    } catch (error) {
      console.error("[Sampler Storage]", error.message);
      return { error: error.message };
    }
  }

  checkAndPruneIfNeeded() {
    const status = this.getStorageStatus();
    if (status.warningLevel) {
      console.warn("[Sampler Storage] Approaching quota, pruning...");
      this.pruneOldData();
    }
  }

  pruneOldData() {
    try {
      const sampledTickets = this.getSampledTickets();
      const now = new Date();
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const toKeep = [];
      const toPrune = [];

      sampledTickets.forEach((ticket) => {
        const [m, d, y] = ticket.date.split("/");
        const ticketDate = new Date(y, m - 1, d);
        if (ticketDate >= cutoffDate) {
          toKeep.push(ticket);
        } else {
          toPrune.push(ticket);
        }
      });

      const compacted = toPrune.map((t) => ({
        date: t.date,
        agent: t.agent,
        misses: t.misses,
      }));

      const archived = this.getArchivedData();
      archived.push(...compacted);

      if (archived.length > 1000) {
        archived.splice(0, archived.length - 500);
      }

      localStorage.setItem(STORAGE_KEYS.MISS_INTELLIGENCE, JSON.stringify(archived));
      localStorage.setItem(STORAGE_KEYS.SAMPLED_TICKETS, JSON.stringify(toKeep));

      console.log("[Sampler Storage] Pruned", toPrune.length, "records");
    } catch (error) {
      console.error("[Sampler Storage] Prune error:", error.message);
    }
  }

  getArchivedData() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MISS_INTELLIGENCE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  handleQuotaExceeded() {
    try {
      this.pruneOldData();
    } catch (e) {
      console.error("[Sampler Storage] Emergency prune failed:", e.message);
    }
    this.quotaExceededHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[Sampler Storage] Handler error:", e.message);
      }
    });
  }

  onQuotaExceeded(handler) {
    this.quotaExceededHandlers.push(handler);
  }

  clearAllStorage() {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
      console.log("[Sampler Storage] Cleared");
      return true;
    } catch (error) {
      return false;
    }
  }

  exportData() {
    return {
      version: SAMPLER_STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      sampledTickets: this.getSampledTickets(),
      archivedIntelligence: this.getArchivedData(),
      storageStatus: this.getStorageStatus(),
    };
  }
}

const samplerStorage = new SamplerStorage();
export default samplerStorage;