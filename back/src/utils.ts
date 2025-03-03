export type route_plan = route[];

export type route = {
    agency: string;
    transport_type: number;
    station_id: number;
    station_seq: number;
    line_name: string;
    departure: string;
    arrival: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
    sunday: string;
    trip_id: string;
};

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
};

export type station = {
    id: number;
    lat: number;
    long: number;
    station_name: string;
    stop_id: string;
    agency: string;
};

export type stationsOnRoute = {
    id: number;
    lat: number;
    long: number;
    station_name: string;
    stop_id: string;
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
    departure: string;
    arrival: string;
    timediff: number;
};

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
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    stop_id: string;
}

export type stationsWithTotalTime = stationsOnRoute & {
    totalTime: number;
};
