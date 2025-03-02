import { CronJob } from "cron";
import Database from "better-sqlite3";
import fetch from "node-fetch";
import unzipper from "unzipper";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import { Calendar, Route, Stop, StopTime, Trip, route, schedule, stationsOnRoute } from "./utils.js";
import * as url from "url";

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, 'database.db'));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");



export async function buildGraph() {
    const rowsB =
        db.prepare(`
            SELECT r.id AS route_id, r.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id, s.station_name AS station_name, 
            s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
            FROM routes r
            JOIN stations s ON r.station_b = s.id
        `).all();


    const tempGraph = new Map<number, stationsOnRoute[]>();

    rowsB.forEach((row) => {
        let rowData = row as stationsOnRoute;
        if (!tempGraph.has(rowData.station)) {
            tempGraph.set(rowData.station, []);
        }
        tempGraph.get(rowData.station)?.push(rowData);
    });

    console.log("done");

    const closeStations = db.prepare(`
        SELECT r.id AS route_id, n.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id,
               s.station_name AS station_name, s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
        FROM nearbyStations n
        JOIN routes r ON r.station_b = n.station_b
        JOIN stations s ON s.id = n.station_b
    `).all();

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