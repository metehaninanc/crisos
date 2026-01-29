import os
import psycopg2


def get_db_config():
    """Return DB connection config from environment with safe defaults."""
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "crisos_db"),
        "user": os.getenv("DB_USER", "crisos_admin"),
        "password": os.getenv("DB_PASSWORD", "k8Pz!9mQ_Lw2#XvR7nE"),
    }


def get_connection():
    """Create a new psycopg2 connection using env-based config."""
    return psycopg2.connect(**get_db_config())
