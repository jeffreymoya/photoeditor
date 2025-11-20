"""Tests for telemetry module (Phase 0 stubs)."""

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExportResult
from unittest.mock import Mock

from tasks_cli.telemetry import (
    NullSpanExporter,
    get_tracer,
    get_meter,
    init_telemetry,
)


class TestNullSpanExporter:
    """Test NullSpanExporter Phase 0 implementation."""

    def test_export_returns_success(self):
        """Verify exporter accepts spans and returns success."""
        exporter = NullSpanExporter()
        mock_span = Mock(spec=ReadableSpan)

        result = exporter.export([mock_span])

        assert result == SpanExportResult.SUCCESS

    def test_export_empty_spans(self):
        """Verify exporter handles empty span list."""
        exporter = NullSpanExporter()

        result = exporter.export([])

        assert result == SpanExportResult.SUCCESS

    def test_export_multiple_spans(self):
        """Verify exporter handles multiple spans."""
        exporter = NullSpanExporter()
        mock_spans = [Mock(spec=ReadableSpan) for _ in range(5)]

        result = exporter.export(mock_spans)

        assert result == SpanExportResult.SUCCESS

    def test_shutdown_no_error(self):
        """Verify shutdown completes without error."""
        exporter = NullSpanExporter()

        # Should not raise
        exporter.shutdown()

    def test_force_flush_returns_true(self):
        """Verify force_flush returns success."""
        exporter = NullSpanExporter()

        result = exporter.force_flush()

        assert result is True

    def test_force_flush_with_timeout(self):
        """Verify force_flush accepts timeout parameter."""
        exporter = NullSpanExporter()

        result = exporter.force_flush(timeout_millis=5000)

        assert result is True


class TestGetTracer:
    """Test get_tracer() returns no-op tracer."""

    def test_returns_tracer(self):
        """Verify get_tracer returns a Tracer instance."""
        tracer = get_tracer("test.module")

        assert isinstance(tracer, trace.Tracer)

    def test_tracer_start_span_noop(self):
        """Verify tracer.start_span() returns no-op context."""
        tracer = get_tracer("test.module")

        # Should not raise, returns no-op span
        with tracer.start_as_current_span("test_operation") as span:
            # No-op span should exist but do nothing
            assert span is not None

    def test_multiple_tracers(self):
        """Verify multiple tracers can be created."""
        tracer1 = get_tracer("module.a")
        tracer2 = get_tracer("module.b")

        # Both should be valid Tracer instances
        assert isinstance(tracer1, trace.Tracer)
        assert isinstance(tracer2, trace.Tracer)


class TestGetMeter:
    """Test get_meter() returns no-op meter."""

    def test_returns_meter(self):
        """Verify get_meter returns a Meter instance."""
        meter = get_meter("test.module")

        assert meter is not None

    def test_meter_create_counter_noop(self):
        """Verify meter.create_counter() returns no-op counter."""
        meter = get_meter("test.module")

        # Should not raise, returns no-op counter
        counter = meter.create_counter("test_counter")
        assert counter is not None

        # Counter.add() should not raise
        counter.add(1)

    def test_meter_create_histogram_noop(self):
        """Verify meter.create_histogram() returns no-op histogram."""
        meter = get_meter("test.module")

        # Should not raise, returns no-op histogram
        histogram = meter.create_histogram("test_histogram")
        assert histogram is not None

        # Histogram.record() should not raise
        histogram.record(42.0)

    def test_multiple_meters(self):
        """Verify multiple meters can be created."""
        meter1 = get_meter("module.a")
        meter2 = get_meter("module.b")

        # Both should be valid instances
        assert meter1 is not None
        assert meter2 is not None


class TestInitTelemetry:
    """Test init_telemetry() Phase 0 no-op."""

    def test_init_disabled(self):
        """Verify init_telemetry(enabled=False) completes without side effects."""
        # Should not raise
        init_telemetry(enabled=False)

        # Tracer and meter should still be no-op
        tracer = get_tracer("test.module")
        meter = get_meter("test.module")

        assert isinstance(tracer, trace.Tracer)
        assert meter is not None

    def test_init_enabled_noop(self):
        """Verify init_telemetry(enabled=True) is no-op in Phase 0."""
        # Phase 0: enabled flag has no effect
        init_telemetry(enabled=True)

        # Tracer and meter should still be no-op
        tracer = get_tracer("test.module")
        meter = get_meter("test.module")

        assert isinstance(tracer, trace.Tracer)
        assert meter is not None

    def test_init_default(self):
        """Verify init_telemetry() with default args completes."""
        # Should not raise
        init_telemetry()

        # Tracer and meter should still be no-op
        tracer = get_tracer("test.module")
        meter = get_meter("test.module")

        assert isinstance(tracer, trace.Tracer)
        assert meter is not None


class TestEndToEnd:
    """Integration tests for no-op telemetry flow."""

    def test_full_noop_workflow(self):
        """Verify full workflow: init -> create tracer/meter -> use -> shutdown."""
        # Initialize telemetry
        init_telemetry(enabled=False)

        # Get tracer and meter
        tracer = get_tracer("test.workflow")
        meter = get_meter("test.workflow")

        # Use tracer
        with tracer.start_as_current_span("operation") as span:
            assert span is not None

        # Use meter
        counter = meter.create_counter("requests")
        counter.add(1)

        histogram = meter.create_histogram("latency")
        histogram.record(100.0)

        # Create and use exporter
        exporter = NullSpanExporter()
        result = exporter.export([])
        assert result == SpanExportResult.SUCCESS

        exporter.force_flush()
        exporter.shutdown()

        # All operations should complete without errors
