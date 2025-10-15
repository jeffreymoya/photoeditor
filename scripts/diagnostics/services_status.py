#!/usr/bin/env python3
"""Render docker compose service status in a compact, human-readable format."""

import json
import sys
from typing import Iterable, List


def load_lines(stdin: Iterable[str]) -> List[str]:
    return [line.strip() for line in stdin if line.strip()]


def render_ports(publishers):
    ports = []
    for publisher in publishers or []:
        if isinstance(publisher, dict):
            url = publisher.get("URL")
            if url:
                ports.append(url)
                continue
            published = publisher.get("PublishedPort") or publisher.get("Published")
            target = publisher.get("TargetPort") or publisher.get("Target")
            if published and target:
                ports.append(f"0.0.0.0:{published}->{target}")
        else:
            ports.append(str(publisher))
    return ", ".join(ports) if ports else "no published ports"


def main():
    raw_lines = load_lines(sys.stdin)
    if not raw_lines:
        print("  - LocalStack: not running (run 'make localstack-up')")
        return

    for raw in raw_lines:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            print(f"  - Unparseable entry: {raw}")
            continue

        service = payload.get("Service") or payload.get("Name") or "unknown"
        state = payload.get("State") or "unknown"
        health = payload.get("Health") or "n/a"
        publishers = payload.get("Publishers") or payload.get("Publisher")
        ports_text = render_ports(publishers if isinstance(publishers, list) else [publishers] if publishers else [])
        print(f"  - {service}: state={state}, health={health}, ports={ports_text}")


if __name__ == "__main__":
    main()
