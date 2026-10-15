import { describe, expect, it } from 'vitest';
import { createMetricsRegistry, registerProcessMetrics } from '../../src/metrics.js';

describe('metrics registry (OPS-63)', () => {
  it('renders counters in the Prometheus text format', () => {
    const registry = createMetricsRegistry();
    const counter = registry.counter('http_requests_total', 'Requests.', ['method', 'status']);
    counter.inc({ method: 'GET', status: '200' });
    counter.inc({ method: 'GET', status: '200' });
    counter.inc({ method: 'POST', status: '404' }, 3);
    const rendered = registry.render();
    expect(rendered).toContain('# HELP http_requests_total Requests.');
    expect(rendered).toContain('# TYPE http_requests_total counter');
    expect(rendered).toContain('http_requests_total{method="GET",status="200"} 2');
    expect(rendered).toContain('http_requests_total{method="POST",status="404"} 3');
  });

  it('escapes label values', () => {
    const registry = createMetricsRegistry();
    registry.counter('test_total', 'Test.', ['route']).inc({ route: 'a"b\\c\nd' });
    expect(registry.render()).toContain('test_total{route="a\\"b\\\\c\\nd"} 1');
  });

  it('refuses counters that decrease and duplicate names of another kind', () => {
    const registry = createMetricsRegistry();
    const counter = registry.counter('x_total', 'X.');
    expect(() => counter.inc(undefined, -1)).toThrow();
    expect(() => registry.gauge('x_total', 'X again.')).toThrow(/already registered/);
  });

  it('rejects sensitive label names outright', () => {
    const registry = createMetricsRegistry();
    expect(() => registry.counter('bad_total', 'Bad.', ['userToken'])).toThrow(/sensitive/);
    expect(() => registry.counter('bad2_total', 'Bad.', ['latitude'])).toThrow(/sensitive/);
  });

  it('samples collect-gauges at render time', () => {
    const registry = createMetricsRegistry();
    let value = 1;
    registry.gauge('sampled', 'Sampled gauge.', ['service'], () => value, { service: 'api' });
    expect(registry.render()).toContain('sampled{service="api"} 1');
    value = 42;
    expect(registry.render()).toContain('sampled{service="api"} 42');
  });

  it('registers the standard process gauges with the service label', () => {
    const registry = createMetricsRegistry();
    registerProcessMetrics(registry, 'relation');
    const rendered = registry.render();
    expect(rendered).toContain('process_uptime_seconds{service="relation"}');
    expect(rendered).toContain('process_resident_memory_bytes{service="relation"}');
    expect(rendered).toContain('process_heap_used_bytes{service="relation"}');
  });
});
