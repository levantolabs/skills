"""Contracts uploaded by sales land here before signature."""
from dataclasses import dataclass


@dataclass
class Contract:
    id: str
    counterparty: str
    text: str


def send_to_legal(contract: Contract, reason: str) -> None:
    print(f"[legal queue] {contract.id}: {reason}")


def approve(contract: Contract) -> None:
    print(f"[approved] {contract.id}")


def process(contract: Contract) -> None:
    # TODO: only contracts that need legal review should go to legal.
    approve(contract)
