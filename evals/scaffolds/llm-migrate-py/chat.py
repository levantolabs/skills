import os

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

SYSTEM = "You are the in-app assistant for a project management tool. Be concise."


def reply(history: list[dict]) -> str:
    resp = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.3,
        messages=[{"role": "system", "content": SYSTEM}, *history],
    )
    return resp.choices[0].message.content
