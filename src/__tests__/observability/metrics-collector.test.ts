// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Metrics Collector (src/lib/observability/metrics-collector.ts)
// Tests counter increment, histogram observation, gauge setting,
// Prometheus format output
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '@/lib/observability/metrics-collector';

describe('metrics-collector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // ── Counter ───────────────────────────────────────────────────

  describe('counter', () => {
    it('should initialize counter with value 0', () => {
      const metrics = collector.getMetrics();
      const apiRequests = metrics.counters.find(c => c.name === 'api_requests_total');
      expect(apiRequests).toBeDefined();
      expect(apiRequests!.value).toBe(0);
    });

    it('should increment counter by 1 by default', () => {
      collector.incrementCounter('api_requests_total');
      const metrics = collector.getMetrics();
      const apiRequests = metrics.counters.find(c => c.name === 'api_requests_total' && !c.labels.method);
      expect(apiRequests!.value).toBe(1);
    });

    it('should increment counter by specified value', () => {
      collector.incrementCounter('api_requests_total', {}, 5);
      const metrics = collector.getMetrics();
      const apiRequests = metrics.counters.find(c => c.name === 'api_requests_total' && !c.labels.method);
      expect(apiRequests!.value).toBe(5);
    });

    it('should create labeled counter entries', () => {
      collector.incrementCounter('api_requests_total', { method: 'GET', path: '/api/health' });
      const metrics = collector.getMetrics();
      const labeled = metrics.counters.find(c => c.labels.method === 'GET');
      expect(labeled).toBeDefined();
      expect(labeled!.value).toBe(1);
    });

    it('should accumulate multiple increments', () => {
      collector.incrementCounter('api_requests_total');
      collector.incrementCounter('api_requests_total');
      collector.incrementCounter('api_requests_total');

      const metrics = collector.getMetrics();
      const apiRequests = metrics.counters.find(c => c.name === 'api_requests_total' && !c.labels.method);
      expect(apiRequests!.value).toBe(3);
    });

    it('should ignore unknown counter names', () => {
      collector.incrementCounter('unknown_counter');
      const metrics = collector.getMetrics();
      expect(metrics.counters.find(c => c.name === 'unknown_counter')).toBeUndefined();
    });

    it('should have all predefined counters', () => {
      const metrics = collector.getMetrics();
      const names = metrics.counters.map(c => c.name);
      expect(names).toContain('api_requests_total');
      expect(names).toContain('credits_consumed_total');
      expect(names).toContain('workflow_executions_total');
      expect(names).toContain('ai_requests_total');
      expect(names).toContain('payment_failures_total');
      expect(names).toContain('payment_success_total');
    });
  });

  // ── Histogram ─────────────────────────────────────────────────

  describe('histogram', () => {
    it('should initialize histogram with sum=0 and count=0', () => {
      const metrics = collector.getMetrics();
      const duration = metrics.histograms.find(h => h.name === 'api_request_duration_seconds');
      expect(duration).toBeDefined();
      expect(duration!.sum).toBe(0);
      expect(duration!.count).toBe(0);
    });

    it('should observe a value and update sum and count', () => {
      collector.observeHistogram('api_request_duration_seconds', {}, 0.1);

      const metrics = collector.getMetrics();
      const duration = metrics.histograms.find(h => h.name === 'api_request_duration_seconds');
      expect(duration!.sum).toBe(0.1);
      expect(duration!.count).toBe(1);
    });

    it('should accumulate multiple observations', () => {
      collector.observeHistogram('api_request_duration_seconds', {}, 0.1);
      collector.observeHistogram('api_request_duration_seconds', {}, 0.3);

      const metrics = collector.getMetrics();
      const duration = metrics.histograms.find(h => h.name === 'api_request_duration_seconds');
      expect(duration!.sum).toBeCloseTo(0.4, 5);
      expect(duration!.count).toBe(2);
    });

    it('should populate bucket counts', () => {
      collector.observeHistogram('api_request_duration_seconds', {}, 0.05);

      const metrics = collector.getMetrics();
      const duration = metrics.histograms.find(h => h.name === 'api_request_duration_seconds');
      // 0.05 should be in le=0.05, le=0.1, le=0.25, etc.
      expect(duration!.bucketCounts.get('0.05')).toBe(1);
      expect(duration!.bucketCounts.get('+Inf')).toBe(1);
    });

    it('should create labeled histogram entries', () => {
      collector.observeHistogram('api_request_duration_seconds', { route: '/api/health' }, 0.02);

      const metrics = collector.getMetrics();
      const labeled = metrics.histograms.find(h => h.labels.route === '/api/health');
      expect(labeled).toBeDefined();
      expect(labeled!.sum).toBe(0.02);
    });

    it('should ignore unknown histogram names', () => {
      collector.observeHistogram('unknown_histogram', {}, 1.0);
      const metrics = collector.getMetrics();
      expect(metrics.histograms.find(h => h.name === 'unknown_histogram')).toBeUndefined();
    });
  });

  // ── Gauge ─────────────────────────────────────────────────────

  describe('gauge', () => {
    it('should initialize gauge with value 0', () => {
      const metrics = collector.getMetrics();
      const activeUsers = metrics.gauges.find(g => g.name === 'active_users');
      expect(activeUsers).toBeDefined();
      expect(activeUsers!.value).toBe(0);
    });

    it('should set gauge to a specific value', () => {
      collector.setGauge('active_users', {}, 42);

      const metrics = collector.getMetrics();
      const activeUsers = metrics.gauges.find(g => g.name === 'active_users');
      expect(activeUsers!.value).toBe(42);
    });

    it('should overwrite previous gauge value', () => {
      collector.setGauge('active_users', {}, 10);
      collector.setGauge('active_users', {}, 20);

      const metrics = collector.getMetrics();
      const activeUsers = metrics.gauges.find(g => g.name === 'active_users');
      expect(activeUsers!.value).toBe(20);
    });

    it('should create labeled gauge entries', () => {
      collector.setGauge('credits_remaining', { plan: 'free' }, 50);

      const metrics = collector.getMetrics();
      const labeled = metrics.gauges.find(g => g.labels.plan === 'free');
      expect(labeled).toBeDefined();
      expect(labeled!.value).toBe(50);
    });

    it('should ignore unknown gauge names', () => {
      collector.setGauge('unknown_gauge', {}, 1);
      const metrics = collector.getMetrics();
      expect(metrics.gauges.find(g => g.name === 'unknown_gauge')).toBeUndefined();
    });
  });

  // ── Prometheus Format Output ──────────────────────────────────

  describe('Prometheus format output', () => {
    it('should produce valid Prometheus text format', () => {
      collector.incrementCounter('api_requests_total');
      const output = collector.toPrometheusFormat();

      expect(output).toContain('# HELP api_requests_total');
      expect(output).toContain('# TYPE api_requests_total counter');
      expect(output).toContain('api_requests_total 1');
    });

    it('should include histogram with buckets', () => {
      collector.observeHistogram('api_request_duration_seconds', {}, 0.05);
      const output = collector.toPrometheusFormat();

      expect(output).toContain('# TYPE api_request_duration_seconds histogram');
      expect(output).toContain('api_request_duration_seconds_bucket');
      expect(output).toContain('api_request_duration_seconds_sum');
      expect(output).toContain('api_request_duration_seconds_count');
      expect(output).toContain('le="+Inf"');
    });

    it('should include gauge values', () => {
      collector.setGauge('active_users', {}, 100);
      const output = collector.toPrometheusFormat();

      expect(output).toContain('# TYPE active_users gauge');
      expect(output).toContain('active_users 100');
    });

    it('should include acquisitionos_info metric', () => {
      const output = collector.toPrometheusFormat();
      expect(output).toContain('acquisitionos_info');
      expect(output).toContain('version="2.0.0"');
    });

    it('should include uptime metric', () => {
      const output = collector.toPrometheusFormat();
      expect(output).toContain('process_uptime_seconds');
    });

    it('should include labeled metrics in Prometheus output', () => {
      collector.incrementCounter('api_requests_total', { method: 'POST' });
      const output = collector.toPrometheusFormat();

      expect(output).toContain('method="POST"');
    });
  });

  // ── Reset ─────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset all metrics to initial state', () => {
      collector.incrementCounter('api_requests_total', {}, 100);
      collector.observeHistogram('api_request_duration_seconds', {}, 0.5);
      collector.setGauge('active_users', {}, 50);

      collector.reset();

      const metrics = collector.getMetrics();
      const apiRequests = metrics.counters.find(c => c.name === 'api_requests_total');
      const duration = metrics.histograms.find(h => h.name === 'api_request_duration_seconds');
      const activeUsers = metrics.gauges.find(g => g.name === 'active_users');

      expect(apiRequests!.value).toBe(0);
      expect(duration!.sum).toBe(0);
      expect(duration!.count).toBe(0);
      expect(activeUsers!.value).toBe(0);
    });
  });
});
