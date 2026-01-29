import hashlib
import os
import re

try:
    from db.connection import get_connection
except ImportError:
    from connection import get_connection

DDL_SQL = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scope_level') THEN
    CREATE TYPE scope_level AS ENUM ('national', 'state', 'city');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supply_category') THEN
    CREATE TYPE supply_category AS ENUM (
      'food', 'water', 'baby_food', 'hygiene_kit', 'accommodation'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level') THEN
    CREATE TYPE severity_level AS ENUM ('info', 'minor', 'moderate', 'severe', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crisis_type') THEN
    CREATE TYPE crisis_type AS ENUM ('flood', 'fire', 'power_outage');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS supply_points (
  id BIGSERIAL PRIMARY KEY,
  city_name TEXT NOT NULL,
  category supply_category NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_name, category, name, address)
);

CREATE INDEX IF NOT EXISTS idx_supply_points_city_category
  ON supply_points ((lower(city_name)), category);

CREATE TABLE IF NOT EXISTS emergency_numbers (
  id BIGSERIAL PRIMARY KEY,
  scope scope_level NOT NULL,
  city_name TEXT,
  label TEXT NOT NULL,
  phone TEXT NOT NULL,
  CONSTRAINT chk_emergency_scope CHECK (
    (scope = 'national' AND city_name IS NULL) OR
    (scope = 'city' AND city_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_emergency_numbers_scope_loc
  ON emergency_numbers (scope, lower(city_name));

CREATE UNIQUE INDEX IF NOT EXISTS ux_emergency_numbers_national
  ON emergency_numbers (label, phone) WHERE scope = 'national';
CREATE UNIQUE INDEX IF NOT EXISTS ux_emergency_numbers_city
  ON emergency_numbers (city_name, label, phone) WHERE scope = 'city';

CREATE TABLE IF NOT EXISTS contact_points (
  id BIGSERIAL PRIMARY KEY,
  city_name TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  phone TEXT,
  UNIQUE (city_name, name, address)
);

CREATE INDEX IF NOT EXISTS idx_contact_points_city ON contact_points ((lower(city_name)));

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  user_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_type CHECK (user_type IN ('admin', 'operator'))
);

ALTER TABLE supply_points DROP COLUMN IF EXISTS city_id;
ALTER TABLE supply_points ADD COLUMN IF NOT EXISTS city_name TEXT;

ALTER TABLE emergency_numbers DROP CONSTRAINT IF EXISTS chk_emergency_scope;
ALTER TABLE emergency_numbers DROP COLUMN IF EXISTS state_id;
ALTER TABLE emergency_numbers DROP COLUMN IF EXISTS city_id;
ALTER TABLE emergency_numbers ADD COLUMN IF NOT EXISTS city_name TEXT;
DELETE FROM emergency_numbers WHERE scope = 'state';
DELETE FROM emergency_numbers WHERE scope = 'city' AND city_name IS NULL;
ALTER TABLE emergency_numbers ADD CONSTRAINT chk_emergency_scope
  CHECK ((scope = 'national' AND city_name IS NULL) OR (scope = 'city' AND city_name IS NOT NULL));

ALTER TABLE contact_points DROP COLUMN IF EXISTS city_id;
ALTER TABLE contact_points ADD COLUMN IF NOT EXISTS city_name TEXT;

CREATE TABLE IF NOT EXISTS handoff_requests (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open',
  risk_score INTEGER,
  crisis_type crisis_type,
  user_status TEXT,
  user_channel TEXT,
  assigned_to TEXT,
  summary_json JSONB,
  CONSTRAINT chk_handoff_status CHECK (status IN ('open', 'assigned', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_handoff_requests_conversation
  ON handoff_requests (conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoff_requests_status
  ON handoff_requests (status);

CREATE TABLE IF NOT EXISTS handoff_messages (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES handoff_requests(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_handoff_sender CHECK (sender IN ('user', 'agent', 'system'))
);

ALTER TABLE handoff_requests ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_handoff_messages_request
  ON handoff_messages (request_id, created_at);
"""


def get_conn():
    return get_connection()


def normalize_name(value):
    if not value:
        return ""
    text = str(value).strip()
    text = re.sub(r"\s*\(.*?\)\s*", "", text)
    replacements = {
        "\u00e4": "a",
        "\u00c4": "A",
        "\u00f6": "o",
        "\u00d6": "O",
        "\u00fc": "u",
        "\u00dc": "U",
        "\u00df": "ss",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def hash_password(password: str) -> str:
    salt = os.getenv("ADMIN_PASSWORD_SALT", "crisis_salt")
    value = f"{salt}:{password}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def upsert_supply_point(cur, city_name, category, name, address,
                        description=None, phone=None):
    city_name = normalize_name(city_name)
    cur.execute(
        """
        INSERT INTO supply_points
          (city_name, category, name, address, description, phone)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (city_name, category, name, address) DO UPDATE
        SET description = EXCLUDED.description,
            phone = EXCLUDED.phone,
            updated_at = now()
        """,
        (city_name, category, name, address, description, phone),
    )


def upsert_emergency_number(cur, scope, city_name, label, phone):
    if scope == "national":
        cur.execute(
            """
            INSERT INTO emergency_numbers (scope, label, phone)
            VALUES (%s, %s, %s)
            ON CONFLICT (label, phone) WHERE scope = 'national'
            DO NOTHING
            """,
            (scope, label, phone),
        )
    else:
        if not city_name:
            return
        city_name = normalize_name(city_name)
        cur.execute(
            """
            INSERT INTO emergency_numbers (scope, city_name, label, phone)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (city_name, label, phone) WHERE scope = 'city'
            DO NOTHING
            """,
            (scope, city_name, label, phone),
        )


def upsert_contact_point(cur, city_name, name, address, description=None,
                         phone=None):
    city_name = normalize_name(city_name)
    cur.execute(
        """
        INSERT INTO contact_points
          (city_name, name, address, description, phone)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (city_name, name, address) DO UPDATE
        SET description = EXCLUDED.description,
            phone = EXCLUDED.phone
        """,
        (city_name, name, address, description, phone),
    )


def upsert_user(cur, username, password, user_type):
    password_hash = hash_password(password)
    cur.execute(
        """
        INSERT INTO users (username, password_hash, user_type)
        VALUES (%s, %s, %s)
        ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            user_type = EXCLUDED.user_type
        """,
        (username, password_hash, user_type),
    )


def main():
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(DDL_SQL)
            upsert_emergency_number(cur, "national", None, "Police", "110")
            upsert_emergency_number(cur, "national", None, "Ambulance", "112")
            upsert_emergency_number(cur, "national", None,
                                    "Federal Emergency Management (BBK)", "0228 99550-0")
            upsert_emergency_number(cur, "national", None,
                                    "Fire & Disaster Response", "112")
            upsert_emergency_number(cur, "national", None,
                                    "Federal Agency for Technical Relief (THW)", "0228 99450-0")
            upsert_emergency_number(cur, "national", None,
                                    "German Weather Service (DWD)", "069 8062-0")
            upsert_emergency_number(cur, "city", "Hamburg",
                                    "Storm Surge Warning Service (WADI)", "040 42840-2700")

            upsert_contact_point(
                cur, "Berlin", "Rathaus Wedding",
                "Mullerstrasse 146, 13353 Berlin",
                "Activated during crises to provide information and emergency calling services.",
                "+49 30 9018-20"
            )
            upsert_contact_point(
                cur, "Berlin", "Rathaus Tiergarten",
                "Mathilde-Jacob-Platz 1, 10551 Berlin",
                "Central emergency point for communication and disaster information.",
                "+49 30 9018-30"
            )
            upsert_contact_point(
                cur, "Berlin", "Rathaus Neukolln",
                "Karl-Marx-Strasse 83, 12043 Berlin",
                "Main disaster response point for the Neukolln district.",
                "+49 30 90239-0"
            )
            upsert_contact_point(
                cur, "Berlin", "Rathaus Reinickendorf",
                "Eichborndamm 215, 13437 Berlin",
                "Official lighthouse providing emergency call capabilities and citizen info.",
                "+49 30 90294-0"
            )
            upsert_contact_point(
                cur, "Essen", "NIP Altenessen-Nord",
                "Johanniskirchstrasse 96, 45329 Essen",
                "Police station acting as an emergency info point for information and help.",
                "+49 201 829-0"
            )
            upsert_contact_point(
                cur, "Essen", "NIP Ruttenscheid",
                "Buscherstrasse 2-6, 45131 Essen",
                "Emergency point at the police station for communication during infrastructure failure.",
                "+49 201 829-0"
            )
            upsert_contact_point(
                cur, "Essen", "NIP Ostviertel",
                "Eiserne Hand 45, 45139 Essen",
                "Fire department location serving as a central hub for emergency requsts.",
                "+49 201 12-27000"
            )
            upsert_contact_point(
                cur, "Nurnberg", "Feurwache 1",
                "Reutersbrunnenstrasse 63, 90429 Nurnberg",
                'Fire station designated as a "Leuchtturm" for citizen safety and info.',
                "+49 911 231-6000"
            )
            upsert_contact_point(
                cur, "Nurnberg", "Feurwache 3",
                "Jakobsplatz 20, 90402 Nurnberg",
                "Central city emergency info point with disaster communication equipment.",
                "+49 911 231-6000"
            )
            upsert_contact_point(
                cur, "Bottrop", "Rathaus / Burgeramt",
                "Ernst-Wilczok-Platz 1, 46236 Bottrop",
                "Official emergency point for civilian support and emergency coordination.",
                "+49 2041 70-30"
            )
            upsert_contact_point(
                cur, "Rostock", "Sporthalle Lutten Klein",
                "Kopenhagener Str. 5, 18107 Rostock",
                "Crisis center providing warmth, drinking water, and information.",
                "+49 381 381-0"
            )
            upsert_contact_point(
                cur, "Coburg", "Feurwehrhaus Dorfles-Esbach",
                "Neustadter Strasse 31, 96487 Dorfles-Esbach",
                "Regional emergency point for disaster coordination and help.",
                "+49 9561 514-0"
            )
            upsert_contact_point(
                cur, "Eichstatt", "Altes Stadttheater",
                "Residenzplatz 17, 85072 Eichstatt",
                "Central lighthouse for the district providing a safe hub and news.",
                "+49 8421 6001-0"
            )
            upsert_contact_point(
                cur, "Aachen", "StadteRegion Aachen (KatS)",
                "Kranzbruchstrasse 15, 52152 Simmerath",
                "High-level disaster lighthouse for regional response and support.",
                "+49 241 5198-3888"
            )
            upsert_contact_point(
                cur, "Planegg", "Kat-Leuchtturm Planegg",
                "Josef-von-Hirsch-Strasse 3, 82152 Planegg",
                "Primary school main entrance used as a central disaster meeting point.",
                "+49 89 89926-0"
            )
            upsert_contact_point(
                cur, "Bocholt", "Biemenhorster Schule I",
                "Birkenallee 70, 46395 Bocholt",
                "Level 2 emergency point with enhanced support and information services.",
                "+49 2871 953-0"
            )

            upsert_user(cur, "crisos_admin", "123456789", "admin")



if __name__ == "__main__":
    main()
