import express, { Response, Request } from "express";
import * as url from "url";
import axios from "axios";
import {
    stationsOnRoute,
    stationTimes,
    timediff,
} from "./utils.js";
import Database from "better-sqlite3";
import { buildGraph } from "./BuildGraph.js";
import { populateData } from "./populateData.js";
import path from "path";
import { MinHeap } from "./MinHeap.js";
import { stat } from "fs";

const router = express.Router();

let MAX_WALKING_DISTANCE = 0.75;

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
        if (!req.params.start || !req.params.end || !req.params.date) {
            return res.json({ error: "Start or end address or start date not valid" });
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
            Number(endInfo.lon),
            Number(req.params.date)
        );

        return res.json({ routes: routes });
    } catch (err) {
        console.log(err);
        return res.json({ error: "Could not find route." });
    }
}

function getTimes(routes: stationsOnRoute[], startDate: number) {
    const currTime = new Date(startDate);
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
            let extraDays = Math.floor(departureTime / (24 * 60 * 60));
            let remainingSeconds = departureTime % (24 * 60 * 60);

            let s = remainingSeconds % 60;
            let m = Math.floor(remainingSeconds / 60) % 60;
            let h = Math.floor(remainingSeconds / 3600);

            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + extraDays) % 7];

            data.departure = `${h.toString().padStart(2, "0")}:${m
                .toString()
                .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }

        if (temp.length > 1) {
            const prevArrivalTime = parseTimeToSeconds(temp[temp.length - 1].time);
            if (prevArrivalTime > departureTime) {
                currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + 1) % 7];
            }
        } else {
            if (currTimeInSeconds > departureTime) {
                currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + 1) % 7];
            }
        }

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

        let arrivalTime = parseTimeToSeconds(data.arrival);
        if (arrivalTime >= 24 * 60 * 60) {
            let extraDays = Math.floor(arrivalTime / (24 * 60 * 60));
            let remainingSeconds = arrivalTime % (24 * 60 * 60);

            let s = remainingSeconds % 60;
            let m = Math.floor(remainingSeconds / 60) % 60;
            let h = Math.floor(remainingSeconds / 3600);

            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + extraDays) % 7];

            data.arrival = `${h.toString().padStart(2, "0")}:${m
                .toString()
                .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }

        currTimeInSeconds = parseTimeToSeconds(data.arrival);

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
    endLong: number,
    date: number
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

    let possibleRoutes = [];
    for (const station of possibleStations) {
        let route = findPath(station, endLat, endLong);
        if (route) {
            possibleRoutes.push(route);
        }
    }

    let leader = Infinity;
    let finalRoute: stationsOnRoute[] = [];

    let processRoute: stationsOnRoute[] = [];
    for (const route of possibleRoutes) {
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
        if (temp.length < leader && temp.length > 1) {
            leader = temp.length;
            finalRoute = temp;
        }

    }

    processRoute = finalRoute;
    const out = getTimes(processRoute, date);
    return out;
}

function findPath(
    start: stationsOnRoute,
    endLat: number,
    endLong: number
): stationsOnRoute[] | null {
    const WALKING_PENALTY = 1000;
    const TRANSFER_PENALTY = 5;

    const pq = new MinHeap<{
        station: stationsOnRoute;
        path: stationsOnRoute[];
        cost: number;
        totalWalking: number;
        line: string;
    }>((a, b) => a.cost - b.cost || a.totalWalking - b.totalWalking);

    pq.push({
        station: start,
        path: [start],
        cost: 0,
        totalWalking: 0,
        line: start.line_name
    });

    const visited = new Set<string>();

    while (!pq.isEmpty()) {
        const current = pq.pop();
        if (!current) return null;

        const { station, path, cost, totalWalking, line } = current;

        if (distanceBetween(station.lat, station.long, endLat, endLong) <= MAX_WALKING_DISTANCE) {
            return path;
        }

        const visitedKey = `${station.id}-${line}`;
        if (visited.has(visitedKey)) continue;
        visited.add(visitedKey);

        let neighbors = graph.get(station.id) || [];

        neighbors.sort((a, b) => {
            const walkA = distanceBetween(station.lat, station.long, a.lat, a.long);
            const walkB = distanceBetween(station.lat, station.long, b.lat, b.long);
            return walkA - walkB;
        });

        for (const neighbor of neighbors) {
            if (visited.has(`${neighbor.id}-${neighbor.line_name}`)) continue;

            let walkDistance = distanceBetween(station.lat, station.long, neighbor.lat, neighbor.long);
            let newCost = cost;
            let newTotalWalking = totalWalking + walkDistance;

            if (neighbor.line_name === line) {
                newCost += walkDistance;
            } else {
                newCost += walkDistance + TRANSFER_PENALTY;
            }

            if (station.line_name !== neighbor.line_name) {
                newCost += WALKING_PENALTY;
            }

            pq.push({
                station: neighbor,
                path: [...path, neighbor],
                cost: newCost,
                totalWalking: newTotalWalking,
                line: neighbor.line_name,
            });
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

async function fromFavorite(req: Request, res: Response) {
    const { data } = req.body;

    if (data && req.params.date) {
        let routes: stationsOnRoute[] = [];

        for (const [key, val] of Object.entries(data)) {
            const station = val as stationTimes;
            routes.push({
                id: station?.station_id,
                lat: station?.lat,
                long: station?.long,
                station_name: station?.station_name,
                stop_id: String(station?.station_id),
                agency: station?.agency,
                line_name: station?.line_name,
                station: station?.station_id,
                route_id: station?.line_name
            });
        }
        console.log(routes);
        const out = getTimes(routes, Number(req.params.date));

        return res.status(200).json({ routes: out })
    }
    return res.status(500).json({ error: "Could not get route data" })
}

router.get("/:start/:end/:date", findRoute1);
router.post("/:date", fromFavorite);

export default router;
