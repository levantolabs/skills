"""Run the compliance checklist over every lease in leases/ and write review.csv
with one row per lease and one column per checklist item."""
from pathlib import Path

from questions import CHECKLIST

LEASES = Path(__file__).parent / "leases"


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
