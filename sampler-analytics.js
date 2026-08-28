/**
 * Sampler 3.0 Analytics Engine
 * Generates performance dashboards from compact sampled intelligence.
 */

import samplerStorage from "./sampler-storage.js";

const MISS_LABELS = {
  jira_missing: "Missing Jira",
  low_csat: "Low CSAT",
  blank_module: "Blank Module",
  blank_feature: "Blank Feature",
  blank_organization: "Blank Organization",
  header_issue: "Header Issue",
  duration_mismatch: "Duration Mismatch",
  suspicious_call: "Suspicious Call",
  status_hold_missing: "Status Missing Hold Reason",
};

class SamplerAnalytics {
  getDailyPerformance(agent, date) {
    const summary = samplerStorage.getAnalyticsSummary(date, date, agent);
    const tickets = samplerStorage.queryMissesByDateRange(date, date, { agent });

    return {
      period: "Daily",
      date: date,
      agent: agent,
      sampledCount: summary.sampledCount,
      cleanSamples: this.countCleanTickets(tickets),
      missBreakdown: this.formatMissBreakdown(summary.byMissType),
      byChannel: summary.byChannel,
      ticketEvidence: tickets.map((t) => ({
        ticketId: t.ticketId,
        zendesk_url: `https://zendesk.com/agent/tickets/${t.ticketId}`,
        channel: t.channel,
        misses: t.misses.map((m) => MISS_LABELS[m] || m),
      })),
      concerns: this.identifyConcerns(tickets),
    };
  }

  getWeeklyPerformance(agent, dateInWeek) {
    const [m, d, y] = dateInWeek.split("/");
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const startDate = this.formatDate(monday);
    const endDate = this.formatDate(sunday);

    const summary = samplerStorage.getAnalyticsSummary(startDate, endDate, agent);
    const tickets = samplerStorage.queryMissesByDateRange(startDate, endDate, { agent });

    const dailyBreakdown = {};
    tickets.forEach((t) => {
      if (!dailyBreakdown[t.date]) {
        dailyBreakdown[t.date] = { count: 0, misses: {} };
      }
      dailyBreakdown[t.date].count += 1;
      t.misses.forEach((m) => {
        dailyBreakdown[t.date].misses[m] = (dailyBreakdown[t.date].misses[m] || 0) + 1;
      });
    });

    return {
      period: "Weekly",
      weekOf: startDate,
      agent: agent,
      sampledCount: summary.sampledCount,
      cleanSamples: this.countCleanTickets(tickets),
      missBreakdown: this.formatMissBreakdown(summary.byMissType),
      byChannel: summary.byChannel,
      dailyTrend: dailyBreakdown,
      trend: this.analyzeTrend(tickets),
      ticketEvidence: tickets.map((t) => ({
        ticketId: t.ticketId,
        zendesk_url: `https://zendesk.com/agent/tickets/${t.ticketId}`,
        date: t.date,
        channel: t.channel,
        misses: t.misses.map((m) => MISS_LABELS[m] || m),
      })),
      concerns: this.identifyConcerns(tickets),
    };
  }

  getMonthlyPerformance(agent, month, year) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    const startDate = this.formatDate(monthStart);
    const endDate = this.formatDate(monthEnd);

    const summary = samplerStorage.getAnalyticsSummary(startDate, endDate, agent);
    const tickets = samplerStorage.queryMissesByDateRange(startDate, endDate, { agent });

    return {
      period: "Monthly",
      monthYear: `${month.toString().padStart(2, "0")}/${year}`,
      agent: agent,
      sampledCount: summary.sampledCount,
      cleanSamples: this.countCleanTickets(tickets),
      missBreakdown: this.formatMissBreakdown(summary.byMissType),
      byChannel: summary.byChannel,
      patterns: this.identifyPatterns(tickets),
      ticketEvidence: tickets.map((t) => ({
        ticketId: t.ticketId,
        zendesk_url: `https://zendesk.com/agent/tickets/${t.ticketId}`,
        date: t.date,
        channel: t.channel,
        misses: t.misses.map((m) => MISS_LABELS[m] || m),
      })),
      concerns: this.identifyConcerns(tickets),
    };
  }

  getQuarterlyPerformance(agent, quarter, year) {
    if (quarter < 1 || quarter > 4) {
      throw new Error("Quarter must be 1-4");
    }

    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    const quarterStart = new Date(year, startMonth - 1, 1);
    const quarterEnd = new Date(year, endMonth, 0);

    const startDate = this.formatDate(quarterStart);
    const endDate = this.formatDate(quarterEnd);

    const summary = samplerStorage.getAnalyticsSummary(startDate, endDate, agent);
    const tickets = samplerStorage.queryMissesByDateRange(startDate, endDate, { agent });

    return {
      period: "Quarterly",
      quarter: `Q${quarter} ${year}`,
      agent: agent,
      sampledCount: summary.sampledCount,
      cleanSamples: this.countCleanTickets(tickets),
      missBreakdown: this.formatMissBreakdown(summary.byMissType),
      byChannel: summary.byChannel,
      frequentMisses: this.identifyFrequentMisses(tickets),
      improvementAreas: this.identifyImprovementAreas(tickets),
      ticketEvidence: tickets.map((t) => ({
        ticketId: t.ticketId,
        zendesk_url: `https://zendesk.com/agent/tickets/${t.ticketId}`,
        date: t.date,
        channel: t.channel,
        misses: t.misses.map((m) => MISS_LABELS[m] || m),
      })),
      concerns: this.identifyConcerns(tickets),
    };
  }

  prepareForAISummary(performanceData) {
    if (!performanceData) return null;

    return {
      period: performanceData.period,
      timeRange: performanceData.date || performanceData.weekOf || performanceData.monthYear || performanceData.quarter,
      agent: performanceData.agent,
      metrics: {
        totalSampled: performanceData.sampledCount,
        cleanSamples: performanceData.cleanSamples,
        issueRate: performanceData.sampledCount > 0 
          ? ((performanceData.sampledCount - performanceData.cleanSamples) / performanceData.sampledCount * 100).toFixed(1) 
          : 0,
      },
      missBreakdown: performanceData.missBreakdown,
      channelDistribution: performanceData.byChannel,
      frequentMisses: performanceData.frequentMisses || [],
      improvementAreas: performanceData.improvementAreas || [],
      patterns: performanceData.patterns || [],
      concerns: performanceData.concerns,
      ticketCount: performanceData.ticketEvidence?.length || 0,
    };
  }

  generateAISummaryPrompt(performanceData) {
    if (!performanceData) return "";

    const aiData = this.prepareForAISummary(performanceData);

    return `
## ${performanceData.agent} - ${performanceData.period} Performance (${aiData.timeRange})

### Metrics
- Total Sampled: ${aiData.metrics.totalSampled}
- Clean Samples: ${aiData.metrics.cleanSamples}
- Issue Rate: ${aiData.metrics.issueRate}%

### Miss Breakdown
${Object.entries(aiData.missBreakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([miss, count]) => `- ${miss}: ${count}`)
  .join("\n")}

### By Channel
${Object.entries(aiData.channelDistribution)
  .map(([channel, count]) => `- ${channel}: ${count}`)
  .join("\n")}

${aiData.frequentMisses?.length > 0 ? `
### Frequent Issues
${aiData.frequentMisses.map((m) => `- ${m}`).join("\n")}
` : ""}

${aiData.patterns?.length > 0 ? `
### Patterns
${aiData.patterns.join("\n")}
` : ""}

${aiData.concerns?.length > 0 ? `
### Concerns
${aiData.concerns.join("\n")}
` : ""}

### Ticket Evidence
Total tickets with misses: ${aiData.ticketCount}
Review ticket IDs in Zendesk for detailed analysis.
`;
  }

  formatDate(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
  }

  countCleanTickets(tickets) {
    return tickets.filter((t) => t.misses.length === 0).length;
  }

  formatMissBreakdown(breakdown) {
    const formatted = {};
    Object.entries(breakdown).forEach(([missType, count]) => {
      formatted[MISS_LABELS[missType] || missType] = count;
    });
    return formatted;
  }

  analyzeTrend(tickets) {
    if (tickets.length < 2) return "insufficient_data";

    const sortedByDate = tickets.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    const midpoint = Math.floor(sortedByDate.length / 2);
    const firstHalf = sortedByDate.slice(0, midpoint);
    const secondHalf = sortedByDate.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, t) => sum + t.misses.length, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t.misses.length, 0) / secondHalf.length;

    if (secondAvg < firstAvg * 0.9) return "improving";
    if (secondAvg > firstAvg * 1.1) return "worsening";
    return "stable";
  }

  identifyPatterns(tickets) {
    const missFreq = {};
    tickets.forEach((t) => {
      t.misses.forEach((m) => {
        missFreq[m] = (missFreq[m] || 0) + 1;
      });
    });

    return Object.entries(missFreq)
      .filter(([_, count]) => count > tickets.length * 0.3)
      .map(([miss, count]) => `${MISS_LABELS[miss] || miss} appears in ${count} samples`);
  }

  identifyFrequentMisses(tickets) {
    const missFreq = {};
    tickets.forEach((t) => {
      t.misses.forEach((m) => {
        missFreq[m] = (missFreq[m] || 0) + 1;
      });
    });

    return Object.entries(missFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([miss, count]) => `${MISS_LABELS[miss] || miss}: ${count}`);
  }

  identifyImprovementAreas(tickets) {
    const patterns = this.identifyPatterns(tickets);
    return patterns.filter((p) => !p.includes("Low CSAT")).slice(0, 3);
  }

  identifyConcerns(tickets) {
    const concerns = [];

    if (tickets.length === 0) {
      return ["No samples to analyze"];
    }

    const cleanCount = tickets.filter((t) => t.misses.length === 0).length;
    const missRate = ((tickets.length - cleanCount) / tickets.length) * 100;
    if (missRate > 50) {
      concerns.push(`High issue rate: ${missRate.toFixed(1)}% of samples have misses`);
    }

    const missFreq = {};
    tickets.forEach((t) => {
      t.misses.forEach((m) => {
        missFreq[m] = (missFreq[m] || 0) + 1;
      });
    });

    const topMiss = Object.entries(missFreq).sort((a, b) => b[1] - a[1])[0];
    if (topMiss && topMiss[1] > tickets.length * 0.4) {
      concerns.push(
        `Recurring issue: ${MISS_LABELS[topMiss[0]] || topMiss[0]} in ${topMiss[1]} samples`
      );
    }

    return concerns;
  }
}

const samplerAnalytics = new SamplerAnalytics();

export default samplerAnalytics;