import express, { Response, Request } from "express";
import * as url from "url";
import axios from "axios";
import { outputRoutes, route_plan, station, stationsOnRoute, stationTimes, timediff } from "./utils.js";
import Database from "better-sqlite3";
import { buildGraph } from './BuildGraph.js'
import { populateData } from "./populateData.js";
import { stat } from "fs";

const router = express.Router();

let MAX_WALKING_DISTANCE = 0.75;

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(':memory:');

db.exec(`ATTACH DATABASE "${__dirname}database.db" AS disk`);
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

await populateData();
let graph: Map<number, stationsOnRoute[]> = await buildGraph();

let daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

async function findRoute1(req: Request, res: Response) {
    try {
        if (!req.params.start || !req.params.end) {
            return res.json({ error: "Start or end address not valid" });
        }
        let start = encodeURIComponent(req.params.start);
        let end = encodeURIComponent(req.params.end);

        let [startResp, endResp] = await Promise.all([
            axios.get(`https://nominatim.openstreetmap.org/search?q=${start}&format=json&limit=1`, { headers: { "User-Agent": "Mozilla/5.0" } }),
            axios.get(`https://nominatim.openstreetmap.org/search?q=${end}&format=json&limit=1`, { headers: { "User-Agent": "Mozilla/5.0" } })
        ]);

        let startInfo = startResp.data[0];
        let endInfo = endResp.data[0];

        let routes: stationsOnRoute[][] = await findRoutes(Number(startInfo.lat), Number(startInfo.lon), Number(endInfo.lat), Number(endInfo.lon));

        return res.json({ routes: routes });
    } catch (err) {
        console.log(err);
        return res.json({ error: "Could not find route." });
    }
}

function getTimes(routes: stationsOnRoute[][]) {
    const currTime = new Date();
    let currDay = currTime.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    let currTimeInSeconds = currTime.getHours() * 3600 + currTime.getMinutes() * 60 + currTime.getSeconds();

    const depart = db.prepare(`
 SELECT
        s.departure AS departure,
        s.arrival AS arrival,
        nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.departure) AS timediff
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    WHERE r.station_a = ? 
        AND r.station_b = ?
        AND r.id = ?
        AND nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.departure) >= 0
    ORDER BY nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.departure)
    LIMIT 1
`);

    //     const arrival = db.prepare(`
    //     SELECT
    //         s.arrival AS time,
    //         nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival) AS timediff
    //     FROM schedules s
    //     JOIN routes r ON s.route_id = r.id
    //     WHERE r.station_b = ? 
    //         AND r.id = ?
    //         AND nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival) >= 0
    //     ORDER BY nexttime(s.monday, s.tuesday, s.wednesday, s.thursday, s.friday, s.saturday, s.sunday, ?,?,s.arrival)
    //     LIMIT 1
    // `);

    let out: outputRoutes[] = [];
    let useData = true;
    for (const route of routes) {
        useData = true;
        let temp: stationTimes[] = [];
        for (let i = 1; i < route.length - 1; i++) {
            let station_b = route[i];
            let station_a = route[i - 1];
            if (station_a.route_id !== station_b.route_id) {
                i++;
                station_a = route[i - 1];
                station_b = route[i];
            }
            console.log(station_a.id, station_b.id)
            let result = depart.get(currDay, currTimeInSeconds, station_a.id, station_b.id, station_b.route_id, currDay, currTimeInSeconds, currDay, currTimeInSeconds);
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
                data.departure = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            }
            currTimeInSeconds = parseTimeToSeconds(data.departure);
            console.log(currDay, currTimeInSeconds)

            temp.push({
                station_id: station_a.id,
                lat: station_a.lat,
                long: station_a.long,
                station_name: station_a.station_name,
                agency: station_a.agency,
                line_name: station_a.line_name,
                time: data?.departure,
                day: currDay
            });

            let arrivalTime = parseTimeToSeconds(data.arrival);
            if (arrivalTime >= 24 * 60 * 60) {
                let s = departureTime % 60;
                let m = Math.floor(departureTime / 60) % 60;
                let h = Math.floor(departureTime / 3600) - 24;
                currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + 1) % 7];
                data.arrival = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            }
            currTimeInSeconds = parseTimeToSeconds(data.arrival);
            console.log(currDay, currTimeInSeconds)

            temp.push({
                station_id: station_b.id,
                lat: station_b.lat,
                long: station_b.long,
                station_name: station_b.station_name,
                agency: station_b.agency,
                line_name: station_b.line_name,
                time: data?.arrival,
                day: currDay
            });
            console.log("-------------------------")
        }
        if (useData) {
            out.push({
                totalTime: 0,
                data: temp
            });
        }
        console.log(temp);
    }


    //         i++;

    //         station = route[i];
    //         result = arrival.get(currDay, currTimeInSeconds, station.id, route[i].route_id, currDay, currTimeInSeconds, currDay, currTimeInSeconds);
    //         data = result as timediff;
    //         console.log(data);
    //         if (!data) {
    //             useData = false;
    //             break;
    //         }
    //         let arrivalTime = parseTimeToSeconds(data.time);
    //         if (arrivalTime >= 24 * 60 * 60) {
    //             let s = arrivalTime % 60;
    //             let m = Math.floor(arrivalTime / 60) % 60;
    //             let h = Math.floor(arrivalTime / 3600) - 24;
    //             data.time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    //         }
    //         currDay = daysOfWeek[(daysOfWeek.indexOf(currDay) + Math.floor(data.timediff / 86400)) % 7];
    //         currTimeInSeconds += (data.timediff % 24);

    //         temp.push({
    //             station_id: station.id,
    //             lat: station.lat,
    //             long: station.long,
    //             station_name: station.station_name,
    //             agency: station.agency,
    //             line_name: station.line_name,
    //             time: data?.time,
    //             day: currDay
    //         });

    //         totalTime += (arrivalTime - departureTime);
    //     }
    //     if (useData) {
    //         out.push({
    //             totalTime: totalTime,
    //             data: temp
    //         });
    //     }
    // }

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
    // await buildGraph();
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
    let temp = [];
    for (const station of possibleStations) {
        // await bfsFindRoutes(station, endLat, endLong, [], routes, visitedRoutes);
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
    const out = getTimes(routes);
    return routes;
}


function findPath(start: stationsOnRoute, endLat: number, endLong: number): stationsOnRoute[] | null {
    for (let i = 0; i < 20; i++) {
        const result = findPathHelper(start, -1, endLat, endLong, [], i, 0);
        if (result) {
            return result;
        }
    }
    return null;
}

function findPathHelper(start: stationsOnRoute, previd: number, endLat: number, endLong: number, route: stationsOnRoute[], maxRoute: number, routeNum: number
): stationsOnRoute[] | null {
    if (distanceBetween(start.lat, start.long, endLat, endLong) <= MAX_WALKING_DISTANCE) {
        return [...route, start];
    }

    if (routeNum >= maxRoute) {
        return null;
    }

    // if (parseInt(start.route_id.split("-")[0]) != previd) {
    //     return null;
    // }

    let temp = [...route, start];
    const neighbors = graph.get(start.id) || [];

    for (const neighbor of neighbors) {
        const currentDist = distanceBetween(start.lat, start.long, endLat, endLong);
        const nextDist = distanceBetween(neighbor.lat, neighbor.long, endLat, endLong);

        if (nextDist < currentDist + (MAX_WALKING_DISTANCE * 5)) {
            const result = findPathHelper(neighbor, start.id, endLat, endLong, temp, maxRoute, routeNum + 1);
            if (result) {
                return result;
            }
        }
    }

    return null;
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
    // let s = db.prepare(`        SELECT r.id AS route_id, r.station_a AS station, s.lat AS lat, s.long AS long, s.id AS id,
    //                s.station_name AS station_name, s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
    //         FROM routes r
    //         JOIN stations s ON s.id = r.station_a
    //         WHERE r.station_a = '5835'`);
    // let s = db.prepare(`            SELECT r.id AS route_id, r.station_b AS station, s.lat AS lat, s.long AS long, s.id AS id, s.station_name AS station_name, 
    //         s.stop_id AS stop_id, s.agency AS agency, r.line_name AS line_name
    //         FROM routes r
    //         JOIN stations s ON r.station_b = s.id`);
    // let s = db.prepare("SELECT * FROM stations s JOIN routes r ON r.station_b = s.id JOIN schedules sc ON sc.route_id = r.id WHERE r.id = '226-206-NJTransit'");
    // let s = db.prepare("SELECT * FROM stations s JOIN routes r ON r.station_b = s.id WHERE s.id = '205'");
    // let s = db.prepare(` SELECT
    //     *
    // FROM schedules s
    // JOIN routes r ON s.route_id = r.id
    // WHERE r.station_a = ? `)
    let s = db.prepare("SELECT * FROM stations s WHERE s.id='204'");
    // await buildGraph();
    // return res.json({ data: [...graph.entries()] });
    return res.json({ data: s.all() });
});
router.get("/:start/:end", findRoute1);

export default router;
