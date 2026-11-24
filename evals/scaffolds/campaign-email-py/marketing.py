"""Marketing helpers used by the campaign scheduler."""
from dataclasses import dataclass


@dataclass
class Product:
    name: str
    tagline: str
    features: list[str]
    price: str


def schedule(email_subject: str, email_body: str, audience: str) -> None:
    print(f"scheduled '{email_subject}' for {audience}")
