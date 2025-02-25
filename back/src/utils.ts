export type route_plan = route[];

export type route = {
    id: string,
    agency: string,
    route_type: number,
    station_a: number | bigint,
    station_b: number | bigint,
    line_name: string
}

export type schedule = {
    route_id: string;
    departure: string;
    arrival: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
}

export type station = {
    id: number,
    lat: number,
    long: number,
    station_name: string,
    stop_id: number,
    agency: string
}

export type outputRoutes = {
    totalTime: number;
    data: stationTimes[];
}

export type stationsOnRoute = {
    id: number;
    lat: number;
    long: number;
    station_name: string;
    stop_id: number;
    agency: string;
    line_name: string;
    station: number;
    route_id: string;
} & { [key: string]: any };

export type stationTimes = {
    station_id: number;
    lat: number;
    long: number;
    station_name: string;
    agency: string;
    line_name: string;
    time: string;
    day: string;
} & { [key: string]: any };

export type timediff = {
    time: string,
    timediff: number
}

export interface StopTime {
    trip_id: string;
    arrival_time: string;
    departure_time: string;
    stop_id: string;
    stop_sequence: number;
}

export interface Trip {
    route_id: string;
    trip_id: string;
    service_id: string;
}

export interface Route {
    route_id: string;
    route_long_name: string;
    route_type: number;
}

export interface Calendar {
    service_id: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
}

export interface Stop {
    stop_name: string,
    stop_lat: number,
    stop_lon: number,
    stop_id: number
}

export type stationsWithTotalTime = stationsOnRoute & {
    totalTime: number;
};