export interface ToolMetric {
  calls: number;
  failures: number;
  total_duration_ms: number;
  last_duration_ms?: number;
  last_error?: string;
}

const startedAt = new Date();
const toolMetrics = new Map<string, ToolMetric>();

export async function trackToolCall<T>(toolName: string, operation: () => Promise<T>): Promise<T> {
  const startTime = Date.now();
  const metric = getOrCreateMetric(toolName);
  metric.calls += 1;

  try {
    const result = await operation();
    metric.last_duration_ms = Date.now() - startTime;
    metric.total_duration_ms += metric.last_duration_ms;
    metric.last_error = undefined;
    return result;
  } catch (error) {
    metric.last_duration_ms = Date.now() - startTime;
    metric.total_duration_ms += metric.last_duration_ms;
    metric.failures += 1;
    metric.last_error = error instanceof Error ? error.message : "Unknown error";
    throw error;
  }
}

export function getMetricsSnapshot() {
  return {
    started_at: startedAt.toISOString(),
    uptime_seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    tools: Object.fromEntries(
      Array.from(toolMetrics.entries()).map(([toolName, metric]) => [
        toolName,
        {
          ...metric,
          average_duration_ms: metric.calls === 0 ? 0 : Math.round(metric.total_duration_ms / metric.calls)
        }
      ])
    )
  };
}

function getOrCreateMetric(toolName: string): ToolMetric {
  const existingMetric = toolMetrics.get(toolName);
  if (existingMetric) return existingMetric;

  const metric: ToolMetric = {
    calls: 0,
    failures: 0,
    total_duration_ms: 0
  };
  toolMetrics.set(toolName, metric);
  return metric;
}
