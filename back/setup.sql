CREATE TABLE stations (
    id INTEGER PRIMARY KEY,
    lat REAL,
    long REAL,
    station_name TEXT,
    stop_id INTEGER,
    agency TEXT,
    UNIQUE(station_name, agency, stop_id)
);

CREATE TABLE routes (
    id INTEGER PRIMARY KEY,
    transport_type INTEGER NOT NULL,
    station_id INTEGER NOT NULL,
    station_seq INTEGER NOT NULL,
    line_name TEXT NOT NULL,
    agency TEXT NOT NULL,
    departure TEXT NOT NULL,
    arrival TEXT NOT NULL,
    monday INTEGER,
    tuesday INTEGER,
    wednesday INTEGER,
    thursday INTEGER,
    friday INTEGER,
    saturday INTEGER,
    sunday INTEGER,
    FOREIGN KEY(station_id) REFERENCES stations(id)
);

CREATE TABLE nearbyStations (
    id INTEGER PRIMARY KEY,
    station_a INTEGER,
    a_agency TEXT,
    station_b INTEGER,
    b_agency TEXT,
    dist INTEGER,
    FOREIGN KEY(station_a) REFERENCES stations(id),
    FOREIGN KEY(station_b) REFERENCES stations(id)
);

-- CREATE TABLE schedules (
--     id INTEGER PRIMARY KEY,
--     route_id INTEGER NOT NULL,
--     departure TEXT NOT NULL,
--     arrival TEXT NOT NULL,
--     monday INTEGER,
--     tuesday INTEGER,
--     wednesday INTEGER,
--     thursday INTEGER,
--     friday INTEGER,
--     saturday INTEGER,
--     sunday INTEGER,
--     FOREIGN KEY(route_id) REFERENCES routes(id),
--     UNIQUE(route_id, departure, arrival)
-- );

CREATE INDEX IF NOT EXISTS idx_stations_stop_id ON stations (stop_id);
CREATE INDEX IF NOT EXISTS idx_routes_line_seq ON routes (line_name, agency, station_seq);
CREATE INDEX IF NOT EXISTS idx_routes_station ON routes (station_id);
CREATE INDEX IF NOT EXISTS idx_stations_id ON stations (id);
CREATE INDEX IF NOT EXISTS idx_station_distances ON nearbyStations (station_a, station_b);


CREATE TABLE shape_id (
    id INTEGER PRIMARY KEY,
    agency TEXT,
    shape_id INTEGER,
    seq_number INTEGER,
    lat REAL,
    long REAL
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    token TEXT,
    username TEXT UNIQUE,
    password TEXT
);
