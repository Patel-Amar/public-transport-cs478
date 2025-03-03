import express, { Response, Request } from "express";
import * as url from "url";
import axios from "axios";
import {
    route_plan,
    station,
    stationsOnRoute,
    stationTimes,
    timediff,
} from "./utils.js";
import Database from "better-sqlite3";
import { buildGraph } from "./BuildGraph.js";
import { populateData } from "./populateData.js";
import { stat } from "fs";
import path from "path";
import { MinHeap } from "./MinHeap.js";

const router = express.Router();

let MAX_WALKING_DISTANCE = 0.75;

// let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
// const db = new Database(":memory:");

// db.exec(`ATTACH DATABASE "${__dirname}database.db" AS disk`);
// db.exec("CREATE TABLE main.routes AS SELECT * FROM disk.routes");
// db.exec("CREATE TABLE main.stations AS SELECT * FROM disk.stations");
// db.exec('CREATE TABLE main.schedules AS SELECT * FROM disk.schedules');
let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, "database.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");

db.function("haversine", (lat1, long1, lat2, long2) => {
    return distanceBetween(
        lat1 as number,
        long1 as number,
        lat2 as number,
        long2 as number
    );
});

db.function(
    "nexttime",
    (mon, tue, wed, thu, fri, sat, sun, currDay, currTime, statTime) => {
        return findNextTime(
            Number(mon),
            Number(tue),
            Number(wed),
            Number(thu),
            Number(fri),
            Number(sat),
            Number(sun),
            String(currDay),
            Number(currTime),
            statTime as string
        );
    }
);

await populateData();
let graph: Map<number, stationsOnRoute[]> = await buildGraph();

let daysOfWeek = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

async function findRoute1(req: Request, res: Response) {
    try {
        if (!req.params.start || !req.params.end) {
            return res.json({ error: "Start or end address not valid" });
        }
        let start = encodeURIComponent(req.params.start);
        let end = encodeURIComponent(req.params.end);

        let [startResp, endResp] = await Promise.all([
            axios.get(
                `https://nominatim.openstreetmap.org/search?q=${start}&format=json&limit=1`,
                {
                    headers: { "User-Agent": "Mozilla/5.0" },
                }
            ),
            axios.get(
                `https://nominatim.openstreetmap.org/search?q=${end}&format=json&limit=1`,
                {
                    headers: { "User-Agent": "Mozilla/5.0" },
                }
            ),
        ]);

        let startInfo = startResp.data[0];
        let endInfo = endResp.data[0];

        if (!startInfo || !endInfo) {
            return res.json({ error: "Could not find location." });
        }

        let routes: stationTimes[] = await findRoutes(
            Number(startInfo.lat),
            Number(startInfo.lon),
            Number(endInfo.lat),
            Number(endInfo.lon)
        );

        return res.json({ routes: routes });
    } catch (err) {
        console.log(err);
        return res.json({ error: "Could not find route." });
    }
}

function getTimes(routes: stationsOnRoute[]) {
    const currTime = new Date();
    let currDay = currTime
        .toLocaleString("en-us", { weekday: "long" })
        .toLowerCase();
    let currTimeInSeconds =
        currTime.getHours() * 3600 +
        currTime.getMinutes() * 60 +
        currTime.getSeconds();

    const depart = db.prepare(`
        WITH r1 AS (
                SELECT *
                FROM routes WHERE station_id = ?
        ),r2 AS (
            SELECT * FROM routes WHERE station_id = ?
        )
        SELECT r1.departure AS 'departure', r2.departure AS 'arrival'
        FROM r1,r2
        WHERE r1.station_seq < r2.station_seq AND r1.trip_id = r2.trip_id
        AND nexttime(r1.monday, r1.tuesday, r1.wednesday, r1.thursday, r1.friday, r1.saturday, r1.sunday, ?,?,r1.departure) >= 0
        ORDER BY nexttime(r1.monday, r1.tuesday, r1.wednesday, r1.thursday, r1.friday, r1.saturday, r1.sunday, ?,?,r1.departure)
        LIMIT 1`);

    let useData = true;
    useData = true;
    let temp: stationTimes[] = [];
    for (let i = 0; i < routes.length - 1; i += 2) {
        let station_a = routes[i];
        let station_b = routes[i + 1];

        let result = depart.get(
            station_a.id,
            station_b.id,
            currDay,
            currTimeInSeconds,
            currDay,
            currTimeInSeconds
        );
        let data = result as timediff;
        if (!data) {
            useData = false;
            break;
        }
        let departureTime = parseTimeToSeconds(data.departure);
        if (departureTime >= 24 * 60 * 60) {
            let s = departureTime % 60;
            let m = Math.floor(departureTime / 60) % 60;
            let h = Math.floor(departureTime / 3600) - 24;
            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + 1) % 7];
            data.departure = `${h.toString().padStart(2, "0")}:${m
                .toString()
                .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }

        let arrivalTime = parseTimeToSeconds(data.arrival);
        if (arrivalTime >= 24 * 60 * 60) {
            let s = arrivalTime % 60;
            let m = Math.floor(arrivalTime / 60) % 60;
            let h = Math.floor(arrivalTime / 3600) - 24;
            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + 1) % 7];
            data.arrival = `${h.toString().padStart(2, "0")}:${m
                .toString()
                .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }

        currTimeInSeconds = parseTimeToSeconds(data.arrival);

        temp.push({
            station_id: station_a.id,
            lat: station_a.lat,
            long: station_a.long,
            station_name: station_a.station_name,
            agency: station_a.agency,
            line_name: station_a.line_name,
            time: data?.departure,
            day: currDay,
        });

        temp.push({
            station_id: station_b.id,
            lat: station_b.lat,
            long: station_b.long,
            station_name: station_b.station_name,
            agency: station_b.agency,
            line_name: station_b.line_name,
            time: data?.arrival,
            day: currDay,
        });
    }

    return temp;
}

function findNextTime(
    mon: number,
    tue: number,
    wed: number,
    thu: number,
    fri: number,
    sat: number,
    sun: number,
    currDay: string,
    currTime: number,
    statTime: string
) {
    let days = [mon, tue, wed, thu, fri, sat, sun];
    let todayIndex = daysOfWeek.indexOf(currDay);

    let statTimeSeconds = parseTimeToSeconds(statTime);

    if (days[todayIndex] === 1 && statTimeSeconds >= currTime) {
        return statTimeSeconds - currTime;
    }

    for (let i = 1; i <= 7; i++) {
        let nextIndex = (todayIndex + i) % 7;
        if (days[nextIndex] === 1) {
            return i * 86400 + statTimeSeconds - (currTime % 86400);
        }
    }

    return -1;
}

function parseTimeToSeconds(time: string) {
    const [h, m, s] = time.split(":").map(Number);
    return (h * 60 + m) * 60 + s;
}

async function findRoutes(
    startLat: number,
    startLong: number,
    endLat: number,
    endLong: number
) {
    let routes: stationsOnRoute[][] = [];

    const stmt = db.prepare(`
            WITH m_routes AS (
                SELECT DISTINCT station_id, line_name, agency, MIN(id) AS id
                FROM routes
                GROUP BY station_id, line_name, agency
            )
        SELECT r.station_id AS id, s.lat AS lat, s.long AS long, s.station_name AS station_name, 
               s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name, r.id AS route_id
        FROM m_routes r
        JOIN stations s ON r.station_id = s.id
        WHERE haversine(s.lat, s.long, ?, ?) <= ?
    `);

    const possibleStations = stmt.all(
        startLat,
        startLong,
        MAX_WALKING_DISTANCE
    ) as stationsOnRoute[];

    let temp = [];
    for (const station of possibleStations) {
        let route = findPath(station, endLat, endLong);
        if (route) {
            temp.push(route);
        }
    }

    let leader = Infinity;
    let finalRoute: stationsOnRoute[] = [];

    for (const route of temp) {
        if (route.length < leader && route.length > 1) {
            leader = route.length;
            finalRoute = route;
        }
    }

    routes.push(finalRoute);

    let processRoute: stationsOnRoute[] = [];
    for (const route of routes) {
        let temp: stationsOnRoute[] = [];
        if (route.length <= 1 || route[1]?.line_name !== route[0].line_name) {
            continue;
        }
        for (let i = 0; i < route.length - 1; i++) {
            let start = route[i];
            while (
                i < route.length - 1 &&
                route[i + 1].line_name === start.line_name
            ) {
                i++;
            }
            if (i < route.length) {
                temp.push(start);
                temp.push(route[i]);
            }
        }
        processRoute = temp;
    }
    const out = getTimes(processRoute);
    return out;
}

function findPath(
    start: stationsOnRoute,
    endLat: number,
    endLong: number
): stationsOnRoute[] | null {
    const pq = new MinHeap<{
        station: stationsOnRoute;
        path: stationsOnRoute[];
        cost: number;
        line: string;
    }>((a, b) => a.cost - b.cost);

    pq.push({ station: start, path: [start], cost: 0, line: start.line_name });

    const visited = new Set<string>();

    while (!pq.isEmpty()) {
        const current = pq.pop();
        if (!current) {
            return null;
        }

        const { station, path, cost, line } = current;

        if (
            distanceBetween(station.lat, station.long, endLat, endLong) <=
            MAX_WALKING_DISTANCE
        ) {
            return path;
        }

        const visitedKey = `${station.id}-${line}`;
        if (visited.has(visitedKey)) continue;
        visited.add(visitedKey);

        const neighbors = graph.get(station.id) || [];

        for (const neighbor of neighbors) {
            if (visited.has(`${neighbor.id}-${neighbor.line_name}`)) continue;

            let newCost =
                cost +
                distanceBetween(neighbor.lat, neighbor.long, endLat, endLong);

            if (neighbor.line_name === line) {
                pq.push({
                    station: neighbor,
                    path: [...path, neighbor],
                    cost: newCost,
                    line: line,
                });
            } else {
                const transferPenalty = 5;
                pq.push({
                    station: neighbor,
                    path: [...path, neighbor],
                    cost: newCost + transferPenalty,
                    line: neighbor.line_name,
                });
            }
        }
    }

    return null;
}

function distanceBetween(
    lat1: number,
    long1: number,
    lat2: number,
    long2: number
) {
    var R = 3963.1;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(long2 - long1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(num: number) {
    return (num * Math.PI) / 180;
}

router.get("/", async (req: Request, res: Response) => {
    let s = db.prepare(`
        SELECT * FROM routes WHERE station_id='100'
    `);
    // await buildGraph();
    // return res.json({ data: [...graph.entries()] });
    return res.json({ data: s.all() });
});
router.get("/:start/:end", findRoute1);

export default router;
