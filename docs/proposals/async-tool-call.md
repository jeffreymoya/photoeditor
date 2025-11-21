Here’s a “from zero to usable” guide in one markdown doc. You can drop this into your repo as `PROCESS_ORCHESTRATOR.md` and iterate.

---

# Python Process Orchestrator for LLM Tools

*Multi-process, long-running commands, streaming stdout back as `command + output` pairs*

---

## 0. Goal

You want an LLM to be able to:

1. Start multiple long-running commands in parallel, e.g.:

   * `mvn spring-boot:run`
   * `pnpm turbo run test --long-running`
   * `...`

2. Receive **continuous updates** when any of those commands emits new output.

3. For each output chunk, the LLM should see at least:

   ```json
   {
     "process_id": "p-123",
     "command": "mvn spring-boot:run",
     "stream": "stdout",
     "data": "Tomcat started on port(s): 8080 (http)",
     "seq": 42
   }
   ```

4. Stop a process (Spring Boot dev server, long test runner) without needing a human Ctrl+C.

This guide focuses on **Python**, `asyncio`, and a simple HTTP/WebSocket gateway that your LLM host can talk to.

---

## 1. High-Level Architecture

```text
+--------------------+          HTTP / WebSocket           +-------------------------+
|        LLM         | <---------------------------------> |   Python Orchestrator   |
|  (agent/toolcall)  |                                      |  (this guide's code)    |
+--------+-----------+                                      +-------------------------+
         |                                                              |
         | starts/stops commands via tools/HTTP                         |
         v                                                              v
                                +---------------------------------------------+
                                |          Process Manager (Python)           |
                                |---------------------------------------------|
                                | - Tracks N processes                       |
                                | - Streams stdout/stderr as events          |
                                | - Sends SIGINT/SIGTERM to stop long runs   |
                                +------------------+--------------------------+
                                                   |
                                     subprocesses   v
                                          +-----------------------+
                                          | mvn spring-boot:run   |
                                          +-----------------------+
                                          | pnpm turbo run test   |
                                          +-----------------------+
```

Key ideas:

* **ProcessManager**: single source of truth; owns all running processes.
* Each process has:

  * `process_id` (UUID)
  * `command` (string)
  * `asyncio.subprocess.Process`
* A shared **event stream** that emits incremental stdout/stderr chunks.

---

## 2. Core Data Structures

Use `dataclasses` for clarity.

```python
# process_manager.py
import asyncio
import dataclasses
import signal
import uuid
from datetime import datetime
from typing import Dict, Optional, AsyncGenerator

@dataclasses.dataclass
class ProcessHandle:
    process_id: str
    command: str
    process: asyncio.subprocess.Process
    start_time: datetime

@dataclasses.dataclass
class ProcessEvent:
    seq: int
    process_id: str
    command: str
    stream: str  # "stdout" | "stderr" | "exit"
    data: str
    returncode: Optional[int]
    timestamp: datetime
```

* `ProcessHandle`: tracks the actual running subprocess.
* `ProcessEvent`: one unit of “news” that the LLM can consume.

---

## 3. ProcessManager: Multi-Process Streaming

This is the core.

```python
# process_manager.py (continued)
class ProcessManager:
    def __init__(self) -> None:
        self._processes: Dict[str, ProcessHandle] = {}
        self._events: asyncio.Queue[ProcessEvent] = asyncio.Queue()
        self._seq_counter: int = 0
        self._lock = asyncio.Lock()  # protect seq + process dict if needed

    async def _next_seq(self) -> int:
        async with self._lock:
            self._seq_counter += 1
            return self._seq_counter

    async def start_process(self, command: str) -> str:
        """
        Starts a new process and begins streaming its output into the event queue.
        Returns the process_id.
        """
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        process_id = uuid.uuid4().hex
        handle = ProcessHandle(
            process_id=process_id,
            command=command,
            process=proc,
            start_time=datetime.utcnow(),
        )

        async with self._lock:
            self._processes[process_id] = handle

        # Attach background readers
        asyncio.create_task(self._read_stream(handle, proc.stdout, "stdout"))
        asyncio.create_task(self._read_stream(handle, proc.stderr, "stderr"))
        asyncio.create_task(self._wait_for_exit(handle))

        return process_id

    async def _publish_event(
        self, handle: ProcessHandle, stream: str, data: str, returncode: Optional[int] = None
    ) -> None:
        event = ProcessEvent(
            seq=await self._next_seq(),
            process_id=handle.process_id,
            command=handle.command,
            stream=stream,
            data=data,
            returncode=returncode,
            timestamp=datetime.utcnow(),
        )
        await self._events.put(event)

    async def _read_stream(
        self,
        handle: ProcessHandle,
        stream_reader: Optional[asyncio.StreamReader],
        stream_name: str,
    ) -> None:
        if stream_reader is None:
            return

        try:
            # line-by-line; change to .read(n) if you want raw chunks
            while True:
                line = await stream_reader.readline()
                if not line:
                    break
                await self._publish_event(
                    handle=handle,
                    stream=stream_name,
                    data=line.decode(errors="replace"),
                )
        except Exception as e:
            await self._publish_event(
                handle=handle,
                stream="stderr",
                data=f"[orchestrator-error reading {stream_name}: {e}]",
            )

    async def _wait_for_exit(self, handle: ProcessHandle) -> None:
        proc = handle.process
        returncode = await proc.wait()

        # Emit an "exit" event
        await self._publish_event(
            handle=handle,
            stream="exit",
            data=f"Process exited with code {returncode}",
            returncode=returncode,
        )

        # Remove from registry
        async with self._lock:
            self._processes.pop(handle.process_id, None)

    async def stop_process(self, process_id: str, sig: int = signal.SIGINT) -> bool:
        """
        Sends signal to the process (SIGINT by default to emulate Ctrl+C).
        Returns True if signal was sent, False if no such process.
        """
        async with self._lock:
            handle = self._processes.get(process_id)

        if not handle:
            return False

        try:
            handle.process.send_signal(sig)
            return True
        except ProcessLookupError:
            return False

    async def list_processes(self) -> Dict[str, dict]:
        """
        Returns a lightweight dict of running processes.
        """
        async with self._lock:
            snapshot = {
                pid: {
                    "process_id": pid,
                    "command": h.command,
                    "pid": h.process.pid,
                    "start_time": h.start_time.isoformat(),
                }
                for pid, h in self._processes.items()
            }
        return snapshot

    async def events(self) -> AsyncGenerator[ProcessEvent, None]:
        """
        Global event stream: caller awaits next() to get new events.
        Single consumer version for simplicity.
        """
        while True:
            event = await self._events.get()
            yield event
```

### Notes

* `start_process(command)` works for *any* shell command: Spring Boot, pnpm, etc.
* `stop_process(process_id, SIGINT)` is how you emulate Ctrl+C.
* `events()` is an **async generator** that yields every new `ProcessEvent`, in global order.

---

## 4. HTTP + WebSocket API Around the Manager

You now wrap this in a minimal FastAPI app so your LLM host (or tools server) can talk to it.

```python
# app.py
import asyncio
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import uvicorn

from process_manager import ProcessManager, ProcessEvent

app = FastAPI()
manager = ProcessManager()


class StartRequest(BaseModel):
    command: str


@app.post("/process/start")
async def start_process(req: StartRequest) -> Dict[str, Any]:
    """
    Start a process: returns { process_id, command }.
    LLM tool can call this via standard HTTP.
    """
    process_id = await manager.start_process(req.command)
    return {
        "process_id": process_id,
        "command": req.command,
    }


class StopRequest(BaseModel):
    process_id: str
    sig: int | None = None


@app.post("/process/stop")
async def stop_process(req: StopRequest) -> Dict[str, Any]:
    """
    Stop a process by sending SIGINT (or custom signal).
    """
    sig = req.sig if req.sig is not None else signal.SIGINT
    ok = await manager.stop_process(req.process_id, sig)
    return {"ok": ok}


@app.get("/process/list")
async def list_processes() -> Dict[str, Any]:
    return {"processes": await manager.list_processes()}


@app.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    """
    WebSocket endpoint that streams ProcessEvents as JSON.
    One simple consumer (the LLM host or UI) attaches here.
    """
    await ws.accept()
    try:
        async for event in manager.events():
            payload = {
                "seq": event.seq,
                "process_id": event.process_id,
                "command": event.command,
                "stream": event.stream,
                "data": event.data,
                "returncode": event.returncode,
                "timestamp": event.timestamp.isoformat(),
            }
            await ws.send_json(payload)
    except WebSocketDisconnect:
        # Client disconnected, just exit
        return


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=9000, reload=True)
```

Now you have:

* `POST /process/start` — LLM tool: “start command X”
* `POST /process/stop` — LLM tool: “stop process Y”
* `GET /process/list` — LLM tool: “what’s running?”
* `WS /ws/events` — continuous stream of events like:

  ```json
  {
    "seq": 17,
    "process_id": "d4f8f3e4b8a44bc68592a368f7f2c5d2",
    "command": "mvn spring-boot:run",
    "stream": "stdout",
    "data": "Tomcat started on port(s): 8080 (http)\n",
    "returncode": null,
    "timestamp": "2025-11-20T06:12:34.123456"
  }
  ```

That `command + output pair` is exactly what you wanted, plus metadata.

---

## 5. Example: Running Multiple Commands at Once

Once the app is running:

### 5.1 Start two long-running commands

```bash
curl -X POST http://localhost:9000/process/start \
  -H "Content-Type: application/json" \
  -d '{"command": "mvn spring-boot:run"}'

curl -X POST http://localhost:9000/process/start \
  -H "Content-Type: application/json" \
  -d '{"command": "pnpm turbo run test --long-running"}'
```

You’ll get two different `process_id`s.

### 5.2 Attach a client to the WebSocket

For testing:

```python
# client_test.py
import asyncio
import websockets
import json

async def main():
    async with websockets.connect("ws://localhost:9000/ws/events") as ws:
        async for msg in ws:
            event = json.loads(msg)
            print(
                f"[{event['seq']}] ({event['process_id']}) {event['command']} "
                f"[{event['stream']}]: {event['data']!r}"
            )

asyncio.run(main())
```

You’ll see interleaved logs from both commands, with their corresponding `command` and `process_id`.

---

## 6. Integration Pattern With an LLM

The LLM itself usually can’t maintain a WebSocket, but your **LLM host / tool server** can.

Typical pattern:

1. **Your orchestrator process** (the same or another Python service) maintains a WebSocket connection to `/ws/events`.

2. It routes events into:

   * A UI (e.g., VSCode extension, web dashboard).
   * A short-poll buffer that the LLM can query using a regular tool call, e.g.:

     * Tool `get_new_process_events(last_seq: int) -> [events]`.

3. The LLM:

   * Uses a “start_process” tool (HTTP POST /process/start).
   * Periodically calls “get_new_process_events” to check what happened *since last_seq*.
   * Decides actions (e.g., stop a process, interpret test failures, etc.).

So even if the LLM is limited to synchronous tool calls, the **orchestrator still has real-time streaming**, and the LLM can “sample” that stream without brittle `sleep(30)` hacks.

If you want pure push (no polling) for a custom agent runtime, you can directly:

* Keep the WebSocket open in your agent backend.
* Whenever a `ProcessEvent` arrives, immediately call the LLM again with a “new log event” message.

---

## 7. Handling Ctrl+C Properly (Spring Boot, etc.)

* Spring Boot dev servers respond to **SIGINT** the same way as terminal Ctrl+C.
* That’s exactly what `send_signal(signal.SIGINT)` does in `stop_process`.

If you want a dedicated “stop by command string” tool for the LLM:

```python
async def stop_by_command_fragment(fragment: str) -> list[str]:
    """
    Stop all processes with commands containing the given fragment.
    Returns list of process_ids that were signaled.
    """
    async with manager._lock:
        matches = [
            handle
            for handle in manager._processes.values()
            if fragment in handle.command
        ]

    stopped = []
    for h in matches:
        ok = await manager.stop_process(h.process_id, signal.SIGINT)
        if ok:
            stopped.append(h.process_id)
    return stopped
```

Then your LLM tool can say: “stop processes matching `mvn spring-boot:run`”.

---

## 8. Performance & Safety Considerations

### Performance / metrics

For a typical dev machine:

* **Latency** from process output → WebSocket event: usually < 5–20 ms.
* You can comfortably handle **dozens** of simultaneous processes (bounded by CPU/RAM).
* You might want to set a **max log length**:

  * e.g., drop or summarise after 50k lines per process.
* Sequence number (`seq`) lets the LLM track “last seen” without missing or re-reading events.

### Qualitative robustness scale

* **Basic**: single process, no stop, just prints output.
* **Good** (this guide): multiple processes, SIGINT stop, global event stream.
* **Excellent** (future upgrade):

  * Per-client subscriptions (broadcast to multiple consumers).
  * Per-process ring buffer & on-demand history.
  * Rate limiting, redaction of secrets from logs.
  * Health checks, restart policies.

### Security

* Only allow commands from a whitelist, or expose start/stop API only on localhost or behind auth.
* Consider filtering logs to strip potential secrets before sending to remote LLMs.

---

## 9. Where to Go Next

If you want to extend this into a full “LLM tool” suite, next steps:

1. Add **Pydantic models** for events and stable tool schemas.
2. Add an endpoint like `/events/after/{seq}` so the LLM can fetch deltas via HTTP (if WebSocket is awkward).
3. Add **tags** per process (e.g. “spring”, “frontend”, “tests”) and let the LLM refer to tags instead of raw commands.
4. Add a simple **summary service**:

   * Every N lines, summarise logs and store a short synopsis per process.
   * LLM can request summaries rather than raw logs when context token budget is tight.
