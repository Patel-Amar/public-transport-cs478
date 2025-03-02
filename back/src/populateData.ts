import { CronJob } from "cron";
import Database from "better-sqlite3";
import fetch from "node-fetch";
import unzipper from "unzipper";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import { Calendar, Route, Stop, StopTime, Trip, route, schedule } from "./utils.js";
import * as url from "url";

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, 'database.db'));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");


db.function("haversine", (lat1, long1, lat2, long2) => {
    return distanceBetween(lat1 as number, long1 as number, lat2 as number, long2 as number);
});

async function populateSeptaData() {
    let outputDir = await getGTFSZip("https://www3.septa.org/developer/gtfs_public.zip", false);
    if (outputDir) {
        await unzip(outputDir, "google_bus.zip");
        await parseData(outputDir, "SEPTA");
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    outputDir = await getGTFSZip("https://www3.septa.org/developer/gtfs_public.zip", false);
    if (outputDir) {
        await unzip(outputDir, "google_rail.zip");
        await parseData(outputDir, "SEPTA");
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
}

async function populateNJTransitData() {
    let outputDir = await getGTFSZip("https://www.njtransit.com/rail_data.zip", true);
    if (outputDir) {
        await parseData(outputDir, "NJTransit");
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
}

function populateNearbyStations() {
    const stmt = db.prepare("INSERT INTO nearbyStations (station_a, a_agency, station_b, b_agency, dist) \
                    SELECT sa.id AS station_a, sa.agency AS a_agency, sb.id AS station_b, sb.agency AS b_agency, haversine(sa.lat, sa.long, sb.lat, sb.long) AS dist \
                    FROM stations sa, stations sb \
                    WHERE sa.id != sb.id \
                    AND haversine(sa.lat, sa.long, sb.lat, sb.long) <= 1");

    stmt.run();
}

async function unzip(filePath: string, filename: string) {
    const directory = await unzipper.Open.file(path.join(filePath, filename));
    await directory.extract({ path: path.join(filePath, "temp") });
}

async function getGTFSZip(url: string, addTemp: boolean) {
    const outputDir = path.resolve(__dirname, "gtfs_data");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/zip" },
        redirect: "follow",
    });

    if (!response.ok) throw new Error(`Failed to fetch GTFS data: ${response.statusText}`);

    const bodyStream = response.body;
    if (!bodyStream) throw new Error("Response body is null or undefined");

    const extractTo = addTemp ? path.join(outputDir, "temp") : outputDir;
    await new Promise((resolve, reject) => {
        const stream = bodyStream.pipe(unzipper.Extract({ path: extractTo }));
        stream.on("close", resolve);
        stream.on("error", reject);
    });

    return outputDir;
}

async function parseData(filePath: string, agency: string) {
    const tempPath = path.join(filePath, "temp");
    await processStations(tempPath, agency);
    await processRoutes(tempPath, agency);
    fs.rmSync(tempPath, { recursive: true, force: true });
}

const stationStops = new Map<string, number>();

async function processStations(filePath: string, agency: string) {
    const stopPath = path.join(filePath, "stops.txt");

    return new Promise<void>((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO stations (station_name, lat, long, stop_id, agency) 
            VALUES (?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction(() => {
            fs.createReadStream(stopPath)
                .pipe(csv())
                .on("data", (row: Stop) => {
                    const { stop_id, stop_name, stop_lat, stop_lon } = row;
                    if (!stationStops.has(`${stop_id}-${agency}`)) {
                        const { lastInsertRowid } = stmt.run(stop_name, stop_lat, stop_lon, stop_id, agency);
                        stationStops.set(`${stop_id}-${agency}`, Number(lastInsertRowid));
                    }
                })
                .on("end", resolve)
                .on("error", reject);
        });

        transaction();
    });
}

async function loadCalendar(filePath: string) {
    const calendarPath = path.join(filePath, "calendar.txt");
    const serviceDays = new Map();

    if (!fs.existsSync(calendarPath)) return serviceDays;

    const data = fs.readFileSync(calendarPath, "utf8").split("\n").slice(1);
    for (const line of data) {
        if (!line.trim()) continue;
        const [service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday] = line.split(",");
        serviceDays.set(service_id, [parseInt(monday), parseInt(tuesday), parseInt(wednesday), parseInt(thursday), parseInt(friday), parseInt(saturday), parseInt(sunday)]);
    }
    return serviceDays;
}

async function loadCalendarExceptions(filePath: string) {
    const calendarDatesPath = path.join(filePath, "calendar_dates.txt");
    const serviceExceptions = new Set<string>();

    if (!fs.existsSync(calendarDatesPath)) {
        return serviceExceptions;
    }

    const data = fs.readFileSync(calendarDatesPath, "utf8").split("\n").slice(1);
    for (const line of data) {
        if (!line.trim()) continue;
        const [service_id] = line.split(",");
        if (!serviceExceptions.has(service_id)) {
            serviceExceptions.add(service_id);
        }
    }
    return serviceExceptions;
}

async function getServiceSchedule(filePath: string) {
    const serviceDays = await loadCalendar(filePath);
    const serviceExceptions = await loadCalendarExceptions(filePath);

    for (const service_id of serviceExceptions) {
        if (!serviceDays.has(service_id)) {
            if (!isNaN(service_id as any) && parseInt(service_id) % 2 === 0) {
                serviceDays.set(service_id, [1, 1, 1, 1, 1, 0, 0]);
            }
            else {
                serviceDays.set(service_id, [0, 0, 0, 0, 0, 1, 1]);
            }
        }
    }
    return serviceDays;
}

async function processRoutes(filePath: string, agency: string) {
    const stopTimesPath = path.join(filePath, "stop_times.txt");
    const tripsPath = path.join(filePath, "trips.txt");
    const routesPath = path.join(filePath, "routes.txt");

    const stopTimes: StopTime[] = await loadFile<StopTime>(stopTimesPath);
    const trips: Trip[] = await loadFile<Trip>(tripsPath);
    const routes: Route[] = await loadFile<Route>(routesPath);
    const calendarMap = await getServiceSchedule(filePath);

    const stopTimesMap = new Map<string, StopTime[]>();
    stopTimes.forEach(st => {
        if (!stopTimesMap.has(st.trip_id)) {
            stopTimesMap.set(st.trip_id, []);
        }
        stopTimesMap.get(st.trip_id)?.push(st);
    });

    let routeData: route[] = [];
    // let scheduleData: schedule[] = [];

    const insertRouteStmt = db.prepare(`
        INSERT OR IGNORE INTO routes (station_id, station_seq, transport_type, line_name, agency, departure, arrival, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // const insertScheduleStmt = db.prepare(`
    //     INSERT OR IGNORE INTO schedules
    //     (route_id, departure, arrival, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
    //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    // `);

    for (const route of routes) {
        console.log(route.route_long_name);
        if (route.route_type === 3) {
            continue;
        }

        for (const trip of trips) {
            if (trip.route_id !== route.route_id) continue;

            const stopList = stopTimesMap.get(trip.trip_id);
            if (!stopList || stopList.length < 2) continue;

            for (let i = 0; i < stopList.length; i++) {
                let stop = stopList[i];

                let stop_id = stationStops.get(`${stop.stop_id}-${agency}`);

                if (!stop_id) {
                    continue;
                }

                let schedule = calendarMap.get(trip.service_id);

                routeData.push({
                    agency: agency,
                    transport_type: route.route_type,
                    station_id: stop_id,
                    station_seq: stop.stop_sequence,
                    line_name: route.route_long_name,
                    departure: stop.departure_time,
                    arrival: stop.arrival_time,
                    monday: schedule[0],
                    tuesday: schedule[1],
                    wednesday: schedule[2],
                    thursday: schedule[3],
                    friday: schedule[4],
                    saturday: schedule[5],
                    sunday: schedule[6]
                });

                // scheduleData.push({
                //     route_id: id,
                //     departure: stop_a.departure_time,
                //     arrival: stop_b.arrival_time,
                //     monday: schedule[0],
                //     tuesday: schedule[1],
                //     wednesday: schedule[2],
                //     thursday: schedule[3],
                //     friday: schedule[4],
                //     saturday: schedule[5],
                //     sunday: schedule[6]
                // });
            }
        }
    }

    db.transaction(() => {
        for (const row of routeData) {
            insertRouteStmt.run(row.station_id, row.station_seq, row.transport_type, row.line_name, row.agency, row.departure, row.arrival, row.monday, row.tuesday, row.wednesday, row.thursday, row.friday, row.saturday, row.sunday);
        }
        // for (const row of scheduleData) {
        //     insertScheduleStmt.run(row.route_id, row.departure, row.arrival, row.monday, row.tuesday, row.wednesday, row.thursday, row.friday, row.saturday, row.sunday);
        // }
    })();
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

function loadFile<T>(filePath: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const results: T[] = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (data) => results.push(data))
            .on("end", () => resolve(results))
            .on("error", reject);
    });
}

export async function populateData() {
    let start = new Date().getTime();
    // await populateSeptaData();
    // await populateNJTransitData();
    // populateNearbyStations();
    console.log("Data update complete:", (new Date().getTime() - start) / 60000);
}
