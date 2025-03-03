import { CronJob } from "cron";
import Database from "better-sqlite3";
import fetch from "node-fetch";
import unzipper from "unzipper";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import {
    Calendar,
    Route,
    Stop,
    StopTime,
    Trip,
    route,
    schedule,
    stationsOnRoute,
} from "./utils.js";
import * as url from "url";

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, "database.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");

export async function buildGraph() {
    const rowsB = db
        .prepare(
            `WITH next_stations AS (
                WITH next_stations_p1 AS (
                    SELECT 
                        station_id AS from_station, 
                        LEAD(station_id) OVER (PARTITION BY line_name, agency, trip_id ORDER BY station_seq) AS to_station,
                        line_name, agency, id
                    FROM routes
                    )
            SELECT from_station, to_station, line_name, agency, id
            FROM next_stations_p1
            WHERE to_station IS NOT NULL
            GROUP BY from_station, to_station, line_name, agency
            )
            SELECT 
                ns.from_station AS station, 
                ns.to_station AS stop_id, 
                ns.line_name, 
                ns.agency, 
                s.lat, 
                s.long, 
                s.id AS station_id, 
                s.station_name, 
                s.stop_id,
                s.id,
                ns.id AS route_id
            FROM next_stations ns
            JOIN stations s ON ns.to_station = s.id
            WHERE ns.to_station IS NOT NULL;

    `
        )
        .all();

    const tempGraph = new Map<number, stationsOnRoute[]>();

    rowsB.forEach((row) => {
        let rowData = row as stationsOnRoute;
        if (!tempGraph.has(rowData.station)) {
            tempGraph.set(rowData.station, []);
        }
        tempGraph.get(rowData.station)?.push(rowData);
    });

    console.log("done");

    const closeStations = db
        .prepare(
            `
            WITH m_routes AS (
                SELECT DISTINCT station_id, line_name, agency, MIN(id) AS id
                FROM routes
                GROUP BY station_id, line_name, agency
            )
            SELECT r.id AS route_id, n.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id,
                s.station_name AS station_name, s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
            FROM nearbyStations n
            JOIN m_routes r ON r.station_id = n.station_b
            JOIN stations s ON s.id = n.station_b
    `
        )
        .all();

    console.log("done1");

    closeStations.forEach((row) => {
        let rowData = row as stationsOnRoute;
        if (!tempGraph.has(rowData.station)) {
            tempGraph.set(rowData.station, []);
        }
        tempGraph.get(rowData.station)?.push(rowData);
    });

    // const closeStations1 = db.prepare(`
    //     SELECT r.id AS route_id, n.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id,
    //            s.station_name AS station_name, s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
    //     FROM nearbyStations n
    //     JOIN routes r ON r.station_a = n.station_b
    //     JOIN stations s ON s.id = n.station_b
    // `).all();

    // console.log("done1");

    // closeStations1.forEach((row) => {
    //     let rowData = row as stationsOnRoute;
    //     if (!tempGraph.has(rowData.station)) {
    //         tempGraph.set(rowData.station, []);
    //     }
    //     tempGraph.get(rowData.station)?.push(rowData);
    // });

    console.log("done2");

    return tempGraph;
}
