import express, { Response, Request } from "express";
import * as url from "url";
import axios from "axios";
import { outputRoutes, route_plan, station, stationsOnRoute, stationTimes, timediff } from "./utils.js";
import Database from "better-sqlite3";

const router = express.Router();

let MAX_WALKING_DISTANCE = 1;

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(':memory:');

// Attach the on-disk database file to the in-memory one
db.exec(`ATTACH DATABASE "${__dirname}database.db" AS disk`);

// Copy all tables from the on-disk database to the in-memory one
db.exec('CREATE TABLE main.routes AS SELECT * FROM disk.routes');
db.exec('CREATE TABLE main.stations AS SELECT * FROM disk.stations');
db.exec('CREATE TABLE main.schedules AS SELECT * FROM disk.schedules');
db.pragma('journal_mode = WAL');
db.pragma("foreign_keys = ON");

db.function("haversine", (lat1, long1, lat2, long2) => {
    return distanceBetween(lat1 as number, long1 as number, lat2 as number, long2 as number);
});

db.function("nexttime", (mon, tue, wed, thu, fri, sat, sun, currDay, currTime, statTime) => {
    return findNextTime(
        Number(mon), Number(tue), Number(wed), Number(thu), Number(fri),
        Number(sat), Number(sun), String(currDay), Number(currTime), statTime as string
    );
});

let daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

async function findRoute1(req: Request, res: Response) {
    try {
        if (!req.params.start || !req.params.end) {
            return res.json({ error: "Start or end address not valid" });
        }
        let start = encodeURIComponent(req.params.start);
        let end = encodeURIComponent(req.params.end);

        // Run both geolocation queries in parallel
        let [startResp, endResp] = await Promise.all([
            axios.get(`https://nominatim.openstreetmap.org/search?q=${start}&format=json&limit=1`, { headers: { "User-Agent": "Mozilla/5.0" } }),
            axios.get(`https://nominatim.openstreetmap.org/search?q=${end}&format=json&limit=1`, { headers: { "User-Agent": "Mozilla/5.0" } })
        ]);

        let startInfo = startResp.data[0];
        let endInfo = endResp.data[0];

        let routes: outputRoutes[] = await findRoutes(Number(startInfo.lat), Number(startInfo.lon), Number(endInfo.lat), Number(endInfo.lon));

        return res.json({ routes: routes });
    } catch (err) {
        console.log(err);
        return res.json({ error: "Could not find route." });
    }
}

let graph: Map<number, stationsOnRoute[]> = new Map();

async function buildGraph() {
    const [rowsA, rowsB] = await Promise.all([
        db.prepare(`
            SELECT r.id AS route_id, r.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id, s.station_name AS station_name, 
            s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
            FROM routes r
            JOIN stations s ON r.station_a = s.id
        `).all(),
        db.prepare(`
            SELECT r.id AS route_id, r.station_b AS station, s.lat AS lat, s.long AS long, s.id AS id, s.station_name AS station_name, 
            s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
            FROM routes r
            JOIN stations s ON r.station_b = s.id
        `).all()
    ]);

    rowsB.forEach((row) => {
        let rowData = row as stationsOnRoute;
        if (!graph.has(rowData.station)) {
            graph.set(rowData.station, []);
        }

        graph.get(rowData.station)?.push({
            id: rowData.id,
            lat: rowData.lat,
            long: rowData.long,
            station_name: rowData.station_name,
            stop_id: rowData.stop_id,
            agency: rowData.agency,
            station: rowData.station,
            line_name: rowData.line_name,
            route_id: rowData.route_id
        });

        rowsA.forEach((prox) => {
            let proxData = prox as stationsOnRoute;
            if (rowData.id !== proxData.station) {
                const distance = distanceBetween(rowData.lat, rowData.long, proxData.lat, proxData.long);
                if (distance <= MAX_WALKING_DISTANCE) {
                    graph.get(rowData.id)?.push({
                        id: proxData.id,
                        lat: proxData.lat,
                        long: proxData.long,
                        station_name: proxData.station_name,
                        stop_id: proxData.stop_id,
                        agency: proxData.agency,
                        station: rowData.station,
                        line_name: proxData.line_name,
                        route_id: proxData.route_id
                    });
                }
            }
        });
    });
}



function getTimes(routes: stationsOnRoute[][]) {
    const currTime = new Date();
    let currDay = currTime.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    let currTimeInSeconds = currTime.getHours() * 3600 + currTime.getMinutes() * 60 + currTime.getSeconds();

    const depart = db.prepare(`
    SELECT
        s.departure AS time,
        nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.departure) AS timediff
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    WHERE r.station_a = ? 
        AND r.id = ?
        AND nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival) >= 0
    ORDER BY nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.departure)
    LIMIT 1
`);

    const arrival = db.prepare(`
    SELECT
        s.arrival AS time,
        nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival) AS timediff
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    WHERE r.station_b = ? 
        AND r.id = ?
        AND nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival) >= 0
    ORDER BY nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival)
    LIMIT 1
`);

    let out: outputRoutes[] = [];
    let useData = true;
    for (const route of routes) {
        useData = true;
        let temp: stationTimes[] = [];
        let totalTime = 0;
        for (let i = 0; i < route.length - 1; i++) {
            let station = route[i];
            let result = depart.get(currDay, currTimeInSeconds, station.id, route[i].route_id, currDay, currTimeInSeconds, currDay, currTimeInSeconds);
            let data = result as timediff;
            if (!data) {
                useData = false;
                break;
            }
            let departureTime = parseTimeToSeconds(data.time);
            if (departureTime >= 24 * 60 * 60) {
                let s = departureTime % 60;
                let m = Math.floor(departureTime / 60) % 60;
                let h = Math.floor(departureTime / 3600) - 24;
                data.time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            }
            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + Math.floor(data.timediff / 86400)) % 7];
            currTimeInSeconds += (data.timediff % 24);

            temp.push({
                station_id: station.id,
                lat: station.lat,
                long: station.long,
                station_name: station.station_name,
                agency: station.agency,
                line_name: station.line_name,
                time: data?.time,
                day: currDay
            })

            i++;

            station = route[i];
            result = arrival.get(currDay, currTimeInSeconds, station.id, route[i].route_id, currDay, currTimeInSeconds, currDay, currTimeInSeconds);
            data = result as timediff;
            if (!data) {
                useData = false;
                break;
            }
            let arrivalTime = parseTimeToSeconds(data.time);
            if (arrivalTime >= 24 * 60 * 60) {
                let s = arrivalTime % 60;
                let m = Math.floor(arrivalTime / 60) % 60;
                let h = Math.floor(arrivalTime / 3600) - 24;
                data.time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            }
            currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + Math.floor(data.timediff / 86400)) % 7];
            currTimeInSeconds += (data.timediff % 24);

            temp.push({
                station_id: station.id,
                lat: station.lat,
                long: station.long,
                station_name: station.station_name,
                agency: station.agency,
                line_name: station.line_name,
                time: data?.time,
                day: currDay
            });

            totalTime += (arrivalTime - departureTime);
        }
        if (useData) {
            out.push({
                totalTime: totalTime,
                data: temp
            });
        }
    }

    return out.sort((a, b) => a.totalTime - b.totalTime);
}

function findNextTime(mon: number, tue: number, wed: number, thu: number, fri: number, sat: number, sun: number, currDay: string, currTime: number, statTime: string) {
    let days = [mon, tue, wed, thu, fri, sat, sun];
    let todayIndex = daysOfWeek.indexOf(currDay);

    let statTimeSeconds = parseTimeToSeconds(statTime);

    if (days[todayIndex] === 1 && statTimeSeconds >= currTime) {
        return statTimeSeconds - currTime;
    }

    for (let i = 1; i <= 7; i++) {
        let nextIndex = (todayIndex + i) % 7;
        if (days[nextIndex] === 1) {
            return (i * 86400) + statTimeSeconds - (currTime % 86400);
        }
    }

    return -1;
}

function parseTimeToSeconds(time: string) {

    let statTimeArr = time.split(":");
    let statSec = parseInt(statTimeArr[0]) * 3600 + parseInt(statTimeArr[1]) * 60 + parseInt(statTimeArr[2]);
    return statSec;
}

async function findRoutes(startLat: number, startLong: number, endLat: number, endLong: number) {
    await buildGraph();
    let routes: stationsOnRoute[][] = [];

    const stmt = db.prepare(`
        SELECT r.station_a AS id, sa.lat AS lat, sa.long AS long, sa.station_name AS station_name, 
               sa.stop_id AS stop_id, sa.agency AS agency, r.line_name AS line_name, r.id AS route_id
        FROM routes r
        JOIN stations sa ON r.station_a = sa.id
        JOIN stations sb ON r.station_b = sb.id
        WHERE haversine(sa.lat, sa.long, ?, ?) <= ? AND
        haversine(sb.lat, sb.long, ?, ?) <= haversine(sa.lat, sa.long, ?, ?)
    `);

    const possibleStations = stmt.all(startLat, startLong, MAX_WALKING_DISTANCE, endLat, endLong, endLat, endLong) as stationsOnRoute[];

    const visitedRoutes = new Set<string>()
    for (const station of possibleStations) {
        await bfsFindRoutes(station, endLat, endLong, [], routes, visitedRoutes);
    }

    let processRoute: stationsOnRoute[][] = [];
    for (const route of routes) {
        let temp: stationsOnRoute[] = [];
        let allow = true;
        if (route.length <= 1 || route[1]?.line_name !== route[0].line_name) {
            continue;
        }
        for (let i = 0; i < route.length - 1; i++) {
            let start = route[i];
            while (i < route.length - 1 && route[i + 1].line_name === start.line_name) {
                i++;
            }
            if (i < route.length) {
                temp.push(start);
                temp.push(route[i]);
            }
        }
        processRoute.push(temp);
    }
    const out = getTimes(processRoute);
    return out;
}

async function bfsFindRoutes(start: stationsOnRoute, endLat: number, endLong: number, route: stationsOnRoute[], routes: stationsOnRoute[][], visitedRoutes: Set<string>) {
    const queue: { station: stationsOnRoute, path: stationsOnRoute[] }[] = [{ station: start, path: [...route, start] }];
    const localVisited = new Set<number>();

    while (queue.length > 0) {
        const { station, path } = queue.shift()!;

        if (localVisited.has(station.id)) {
            continue;
        }

        localVisited.add(station.id);

        if (distanceBetween(station.lat, station.long, endLat, endLong) <= MAX_WALKING_DISTANCE) {
            const pathIdentifier = path.map(st => st.id).join("-");
            if (!visitedRoutes.has(pathIdentifier)) {
                visitedRoutes.add(pathIdentifier);
                routes.push([...path]);
            }
        }

        const neighbors = graph.get(station.id) || [];
        for (const neighbor of neighbors) {
            if (!localVisited.has(neighbor.id)) {
                const currentDist = distanceBetween(station.lat, station.long, endLat, endLong);
                const nextDist = distanceBetween(neighbor.lat, neighbor.long, endLat, endLong);

                if (nextDist < currentDist + (MAX_WALKING_DISTANCE * 5)) {
                    queue.push({ station: neighbor, path: [...path, neighbor] });
                }
            }
        }
    }
}

function distanceBetween(lat1: number, long1: number, lat2: number, long2: number) {
    var R = 3963.1;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(long2 - long1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(num: number) {
    return num * Math.PI / 180;
}


router.get("/", async (req: Request, res: Response) => {
    // let s = db.prepare("SELECT * FROM schedules");
    // await buildGraph();
    return res.json({ data: [...graph.entries()] });
});
router.get("/:start/:end", findRoute1);

export default router;
