"""OpenTelemetry telemetry infrastructure for tasks CLI.

Phase 0 stub - will wire to OTLP collector in Phase 3.

This module provides no-op telemetry infrastructure that can be populated
with real spans and metrics in future phases without changing call sites.

Architecture:
- NullSpanExporter: Accepts and discards all spans without errors
- get_tracer(): Returns NoOpTracer from opentelemetry-api
- get_meter(): Returns NoOpMeter from opentelemetry-api
- init_telemetry(): Sets up global provider (no-op for now)

Standards compliance:
- Follows standards/typescript.md principle of fail-safe defaults
- Supports future observability per standards/cross-cutting.md
"""

from typing import Optional, Sequence
from opentelemetry import trace
from opentelemetry import metrics
from opentelemetry.sdk.trace import TracerProvider, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource


class NullSpanExporter(SpanExporter):
    """No-op span exporter that discards all spans.

    Phase 0 implementation - accepts spans but performs no I/O.
    Future phases will replace with OTLP exporter for real telemetry.
    """

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        """Accept and discard spans without errors.

        Args:
            spans: Sequence of spans to export (ignored in Phase 0)

        Returns:
            SpanExportResult.SUCCESS to indicate no errors occurred
        """
        # No-op: discard all spans
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        """Shutdown exporter (no-op in Phase 0)."""
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """Force flush pending spans (no-op in Phase 0).

        Args:
            timeout_millis: Timeout in milliseconds (ignored in Phase 0)

        Returns:
            True to indicate successful flush (no spans to flush)
        """
        return True


def get_tracer(name: str) -> trace.Tracer:
    """Get a tracer instance for the given name.

    Phase 0: Returns NoOpTracer that produces no spans.
    Future phases will return real tracer with OTLP export.

    Args:
        name: Tracer name, typically module name (e.g., 'tasks_cli.commands')

    Returns:
        NoOpTracer instance that safely ignores all tracing operations
    """
    # Return NoOpTracer by using the default (uninitialized) global provider
    return trace.get_tracer(name)


def get_meter(name: str) -> metrics.Meter:
    """Get a meter instance for the given name.

    Phase 0: Returns NoOpMeter that produces no metrics.
    Future phases will return real meter with OTLP export.

    Args:
        name: Meter name, typically module name (e.g., 'tasks_cli.metrics')

    Returns:
        NoOpMeter instance that safely ignores all metric operations
    """
    # Return NoOpMeter by using the default (uninitialized) global provider
    return metrics.get_meter(name)


def init_telemetry(enabled: bool = False) -> None:
    """Initialize telemetry infrastructure.

    Phase 0: No-op initialization. Global providers remain unset,
    causing get_tracer()/get_meter() to return no-op implementations.

    Phase 3: Will configure TracerProvider/MeterProvider with OTLP exporters
    when enabled=True.

    Args:
        enabled: Whether to enable telemetry (no effect in Phase 0)

    Side effects:
        None in Phase 0. Future phases will set global tracer/meter providers.
    """
    # Phase 0: No-op - global providers remain uninitialized (NoOp)
    # Future phases will add:
    # if enabled:
    #     resource = Resource.create({"service.name": "tasks-cli"})
    #     tracer_provider = TracerProvider(resource=resource)
    #     tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    #     trace.set_tracer_provider(tracer_provider)
    #
    #     meter_provider = MeterProvider(resource=resource)
    #     meter_provider.add_metric_reader(PeriodicExportingMetricReader(OTLPMetricExporter()))
    #     metrics.set_meter_provider(meter_provider)
    pass
