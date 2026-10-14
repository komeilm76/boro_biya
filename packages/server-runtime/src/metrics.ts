/**
 * A minimal Prometheus-text-format metrics registry (OPS-63). Small and owned rather than a new
 * dependency (GOV-13, GOV-80): the skeleton needs counters and gauges, and the rules that matter
 * are structural — bounded label names, no sensitive or high-cardinality label values, and an
 * exposition format a standard scraper can read. Histograms and SLO alerting arrive with the
 * phases that own them (ADR-028 baselines are measured client-side by the load-test script).
 */
import { isSensitiveKey } from './redaction.js';

const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export type LabelValues = Readonly<Record<string, string | number>>;

export interface CounterHandle {
  inc(labels?: LabelValues, value?: number): void;
  value(labels?: LabelValues): number;
}

export interface GaugeHandle {
  set(value: number, labels?: LabelValues): void;
  value(labels?: LabelValues): number;
}

interface Series {
  labels: ReadonlyArray<[string, string]>;
  value: number;
  collect?: () => number;
}

interface Metric {
  name: string;
  help: string;
  kind: 'counter' | 'gauge';
  labelNames: string[];
  series: Map<string, Series>;
}

export interface MetricsRegistry {
  counter(name: string, help: string, labelNames?: string[]): CounterHandle;
  /**
   * A gauge. `collect` registers a series whose value is sampled at render time; `collectLabels`
   * fixes that series' label values (for example `{ service: 'api' }`).
   */
  gauge(
    name: string,
    help: string,
    labelNames?: string[],
    collect?: () => number,
    collectLabels?: LabelValues,
  ): GaugeHandle;
  render(): string;
  reset(): void;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function seriesKey(
  labelNames: string[],
  labels: LabelValues | undefined,
): { key: string; pairs: Array<[string, string]> } {
  const pairs: Array<[string, string]> = labelNames.map((name) => {
    const raw = labels?.[name];
    if (raw === undefined) return [name, ''];
    return [name, String(raw)];
  });
  return { key: pairs.map(([name, value]) => `${name}=${value}`).join(','), pairs };
}

export function createMetricsRegistry(): MetricsRegistry {
  const metrics = new Map<string, Metric>();

  function define(name: string, help: string, kind: 'counter' | 'gauge', labelNames: string[]): Metric {
    if (!METRIC_NAME.test(name)) throw new Error(`invalid metric name "${name}"`);
    for (const label of labelNames) {
      if (!LABEL_NAME.test(label)) throw new Error(`invalid label name "${label}" on metric "${name}"`);
      if (isSensitiveKey(label)) {
        throw new Error(
          `label "${label}" on metric "${name}" looks sensitive; metrics never carry sensitive labels (OPS-63)`,
        );
      }
    }
    const existing = metrics.get(name);
    if (existing !== undefined) {
      if (existing.kind !== kind) throw new Error(`metric "${name}" is already registered as ${existing.kind}`);
      return existing;
    }
    const metric: Metric = { name, help, kind, labelNames, series: new Map() };
    metrics.set(name, metric);
    return metric;
  }

  function getSeries(metric: Metric, labels: LabelValues | undefined): Series {
    const { key, pairs } = seriesKey(metric.labelNames, labels);
    const existing = metric.series.get(key);
    if (existing !== undefined) return existing;
    const created: Series = { labels: pairs, value: 0 };
    metric.series.set(key, created);
    return created;
  }

  return {
    counter(name, help, labelNames = []) {
      const metric = define(name, help, 'counter', labelNames);
      return {
        inc(labels?: LabelValues, value = 1): void {
          if (value < 0) throw new Error(`counter "${name}" cannot decrease`);
          getSeries(metric, labels).value += value;
        },
        value(labels?: LabelValues): number {
          return getSeries(metric, labels).value;
        },
      };
    },
    gauge(name, help, labelNames = [], collect?, collectLabels?) {
      const metric = define(name, help, 'gauge', labelNames);
      const series = getSeries(metric, collectLabels);
      if (collect !== undefined) series.collect = collect;
      return {
        set(value: number, labels?: LabelValues): void {
          getSeries(metric, labels).value = value;
        },
        value(labels?: LabelValues): number {
          return getSeries(metric, labels).value;
        },
      };
    },
    render(): string {
      const lines: string[] = [];
      for (const metric of metrics.values()) {
        lines.push(`# HELP ${metric.name} ${metric.help.replace(/\n/g, ' ')}`);
        lines.push(`# TYPE ${metric.name} ${metric.kind}`);
        for (const series of metric.series.values()) {
          const value = series.collect !== undefined ? series.collect() : series.value;
          const renderedLabels = series.labels
            .map(([name, value2]) => `${name}="${escapeLabelValue(value2)}"`)
            .join(',');
          lines.push(renderedLabels === '' ? `${metric.name} ${value}` : `${metric.name}{${renderedLabels}} ${value}`);
        }
      }
      return `${lines.join('\n')}\n`;
    },
    reset(): void {
      for (const metric of metrics.values()) metric.series.clear();
    },
  };
}

/**
 * Standard process gauges, collected at scrape time. Bound to the non-public metrics interface
 * like every other metric (OPS-63).
 */
export function registerProcessMetrics(registry: MetricsRegistry, service: string): void {
  const labels = { service };
  registry.gauge(
    'process_uptime_seconds',
    'Process uptime in seconds.',
    ['service'],
    () => Math.round(process.uptime()),
    labels,
  );
  registry.gauge(
    'process_resident_memory_bytes',
    'Resident set size in bytes.',
    ['service'],
    () => process.memoryUsage().rss,
    labels,
  );
  registry.gauge(
    'process_heap_used_bytes',
    'V8 heap used in bytes.',
    ['service'],
    () => process.memoryUsage().heapUsed,
    labels,
  );
}
