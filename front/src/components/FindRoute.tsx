import { Box, Button, HStack, Input, VStack, Text, ButtonGroup, Spinner } from '@chakra-ui/react';
import Feature from 'ol/Feature';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { Point } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import 'ol/ol.css';
import { fromLonLat } from 'ol/proj';
import { XYZ } from 'ol/source';
import VectorSource from 'ol/source/Vector';
import { useEffect, useRef, useState } from 'react';
import { item, routes } from './utils';
import { InputGroup } from './ui/input-group';
import axios from 'axios';
import Style from 'ol/style/Style';
import { Circle as CircleStyle, Fill, Stroke } from 'ol/style';

function FindRoute() {
    const [start, setStart] = useState<string>("");
    const [end, setEnd] = useState<string>("");
    const [startTime, setStartTime] = useState<string>("");
    const [route, setRoute] = useState<routes>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [pins, setPins] = useState<Feature[]>([]);
    const [disableFav, setDisableFav] = useState<boolean>(false);
    const [search, setSearch] = useState<boolean>(false);
    const mapRef = useRef();

    const colors = [
        "#1ecbe1",
        "#53ac73",
        "#ded921",
        "#e3a11c",
        "#e92016",
        "#da25d3",
        "#9404fb",
        "#7a86bb",
        "#4be21d",
        "#af50a5",
        "#80ac53"
    ];

    async function addFavorite() {
        try {
            await axios.post(`/api/favorite/`, {
                data: route
            });
            setDisableFav(true);
        }
        catch (err) {
            console.log(err);
        }
    }

    async function findRoute() {
        setLoading(true);
        setDisableFav(false);
        setSearch(true);
        if (start && end) {
            try {
                const epoch = new Date(startTime).getTime();
                const resp = await axios.get(`/api/search/${start}/${end}/${epoch}`);

                setRoute(resp.data.routes);
                console.log(resp.data.routes);

                setPins([]);
                const routes = resp.data.routes as routes;

                const newPins: Feature[] = [];
                let i = 0;
                for (const route of routes) {
                    const coords = fromLonLat([route.long, route.lat]);
                    const iconStyle = new Style({
                        image: new CircleStyle({
                            radius: 6,
                            fill: new Fill({ color: colors[i % colors.length] }),
                            stroke: new Stroke({ color: 'black', width: 2 })
                        }),
                    });

                    const iconFeature = new Feature({
                        geometry: new Point(coords),
                        name: route.station_name,
                        line: route.line_name
                    });

                    iconFeature.setStyle(iconStyle);

                    newPins.push(iconFeature);
                    i++;
                }

                setPins(newPins)

            } catch (error) {
                console.error("Error fetching route:", error);
            } finally {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        if (!mapRef.current) return;

        const cartoVoyager = new TileLayer({
            source: new XYZ({
                url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
                attributions: '&copy; <a href="https://www.carto.com/">CARTO</a>'
            }),
        });

        const vectorSource = new VectorSource({
            features: pins,
        })

        const vectorLayer = new VectorLayer({
            source: vectorSource,
        })


        const place = fromLonLat([-74.4057, 40.0583]);

        const map = new Map({
            target: mapRef.current,
            layers: [cartoVoyager, vectorLayer],
            view: new View({
                center: place,
                zoom: 7,
            }),
        })
        return () => map.setTarget(undefined);
    }, [pins])
    return (
        <HStack width={"100%"} height={"100%"} padding={"1rem"}>
            <Box ref={mapRef} w="60%" h="60%"></Box>
            <Box flexGrow={1}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        findRoute();
                    }}>
                    <VStack>
                        <InputGroup
                            flexGrow={1}
                            backgroundColor="#0F1016"
                            borderRadius="3px"
                            w={"100%"}
                        >
                            <Input required placeholder="Start Address" border="none" color="white" onChange={(e) => { setStart(e.target.value) }} value={start} />
                        </InputGroup>
                        <InputGroup
                            flexGrow={1}
                            backgroundColor="#0F1016"
                            borderRadius="3px"
                            w={"100%"}
                        >
                            <Input required placeholder="End Address" border="none" color="white" onChange={(e) => { setEnd(e.target.value) }} value={end} />
                        </InputGroup>
                        <HStack w={"100%"}>
                            <Text whiteSpace={"nowrap"} flexGrow={1}>
                                Trip Start Time:
                            </Text>
                            <InputGroup

                                backgroundColor="#0F1016"
                                borderRadius="3px"
                                w={"50%"}
                            >
                                <Input required border="none" color="white" type='datetime-local' onChange={(e) => { setStartTime(e.target.value) }} value={startTime} />
                            </InputGroup>
                        </HStack>
                        <ButtonGroup
                            size="sm"
                            variant="outline"
                            borderColor="white"
                            borderRadius="4px"
                            borderWidth="1px"
                            width={"100%"}
                            display="flex"
                            justifyContent="center"
                            mb={"2rem"}
                        >
                            <Button color="white" border={"none"} type='submit'>Find</Button>
                        </ButtonGroup>

                        {loading && <Spinner size="lg" color="white" />}

                        {route?.length > 1 ?
                            <VStack width="100%" overflowY={"scroll"} maxH={"30vh"}>
                                {route.map((route: item, index: number) => (
                                    <HStack key={index} justifyContent="space-between" width="100%" mb={"1rem"}>
                                        <VStack align="flex-start">
                                            <Text color={colors[index % colors.length]}>{route.station_name}</Text>
                                            <Text>{route.line_name}</Text>
                                            <Text>{route.agency}</Text>
                                        </VStack>
                                        <VStack align="flex-end">
                                            <Text>{route.time}</Text>
                                            <Text>{route.day}</Text>
                                        </VStack>
                                    </HStack>
                                ))}
                                <Button border={"none"} disabled={disableFav} onClick={addFavorite}>Favorite Route</Button>
                            </VStack> : (search && !loading ? <Text>Could not find route</Text> : "")}
                    </VStack>
                </form>
            </Box>
        </HStack >
    );
}

export default FindRoute;
