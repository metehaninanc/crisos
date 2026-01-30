import os
from pathlib import Path
import psycopg2


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(Path(__file__).resolve().parents[1] / ".env")


def get_db_config():
    """Return DB connection config from environment variables."""
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "crisos_db"),
        "user": os.getenv("DB_USER", "crisos_admin"),
        "password": os.getenv("DB_PASSWORD", ""),
    }


def get_connection():
    """Create a new psycopg2 connection using env-based config."""
    return psycopg2.connect(**get_db_config())
