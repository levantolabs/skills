"""Live support calls. The speech-to-text service calls on_transcript_line for
every finalized line of a call while the call is in progress."""


def notify_supervisor(call_id: str, reason: str) -> None:
    print(f"[supervisor] call {call_id}: {reason}")


async def on_call_started(call_id: str) -> None:
    pass


async def on_transcript_line(call_id: str, speaker: str, text: str) -> None:
    pass


async def on_call_ended(call_id: str) -> None:
    pass
