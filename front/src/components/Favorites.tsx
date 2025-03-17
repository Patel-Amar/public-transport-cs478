import { useEffect, useState } from 'react';
import { Box, Button, ButtonGroup, HStack, Input, Text, VStack } from "@chakra-ui/react";
import axios from 'axios';
import { InputGroup } from './ui/input-group';
import { item, routes } from './utils';
import { FaTrash } from "react-icons/fa";

function Favorites() {
    type favoritedType = {
        route: string,
        user_id: number,
        id: number
    };

    const [favorited, setFavorited] = useState<favoritedType[]>([]);
    const [selectedRoute, setSelectedRoute] = useState<routes>([]);
    const [startTime, setStartTime] = useState<string>("");
    const [selectedFav, setSelectedFav] = useState<favoritedType>();

    useEffect(() => {
        (async () => {
            const resp = await axios.get("/api/favorite");
            setFavorited(resp.data.routes);
        })()
    }, []);

    async function getRightTime() {
        if (selectedFav && startTime) {
            const time = new Date(startTime).getTime();
            const resp = await axios.post(`/api/search/${time}`, {
                data: JSON.parse(selectedFav.route)
            }, {
                headers: { "Content-Type": "application/json" }
            });

            setSelectedRoute(resp.data.routes);
        }
    }

    async function deleteFav(fav_id: number) {
        try {
            axios.delete(`/api/favorite/${fav_id}`)
        } catch (err) {
            console.log(err);
        }
    }

    function outRoute() {
        return favorited.map((fav, index) => {
            const data = JSON.parse(fav.route);
            return (
                <HStack
                    key={index}
                    p={3}
                    w="100%"
                    borderBottom="1px solid gray"
                    _hover={{ bg: "gray.700" }}
                    cursor="pointer"
                    justifyContent="space-between"
                >
                    <Box
                        onClick={() => {
                            setSelectedFav(fav);
                            setSelectedRoute(JSON.parse(fav.route));
                            setStartTime("");
                        }}
                        flexGrow={1}
                    >
                        <Text color="white">{data[0].station_name} → {data[data.length - 1].station_name}</Text>
                    </Box>
                    <FaTrash
                        name="delete"
                        color="red.500"
                        cursor="pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteFav(fav.id);
                            setFavorited(favorited.filter(f => f.id !== fav.id));
                        }}
                    />
                </HStack>
            );
        });
    }

    return (
        <HStack w="100vw" h="100vh">
            <VStack
                w="25%"
                h="100vh"
                bg="black"
                p={4}
                align="stretch"
                overflowY="auto"
            >
                <Text color="white" fontSize="lg" fontWeight="bold" mb={4}>Favorited Routes</Text>
                {favorited.length === 0 ? (
                    <Text color="gray.400">No Favorited Routes</Text>
                ) : (
                    outRoute()
                )}
            </VStack>

            <VStack
                w="75%"
                h="100vh"
                p={6}
                align="stretch"
            >
                {!selectedFav ? (
                    <Text fontSize="xl" color="gray.500">Select a route to see details</Text>
                ) : (
                    <Box flexGrow={1}>
                        <form
                            onSubmit={(e) => e.preventDefault()}
                        >
                            <VStack>
                                <HStack w="100%">
                                    <Text whiteSpace="nowrap" flexGrow={1}>
                                        Trip Start Time:
                                    </Text>
                                    <InputGroup backgroundColor="#0F1016" borderRadius="3px" w="50%">
                                        <Input
                                            required
                                            border="none"
                                            color="white"
                                            type='datetime-local'
                                            onChange={(e) => setStartTime(e.target.value)}
                                            value={startTime}
                                        />
                                    </InputGroup>
                                </HStack>

                                <ButtonGroup size="sm" variant="outline" borderColor="white" borderRadius="4px" borderWidth="1px" width="100%" justifyContent="center" mb="2rem">
                                    <Button color="white" border="none" onClick={getRightTime}>New Start Time</Button>
                                </ButtonGroup>

                                {selectedRoute.length > 1 ? (
                                    <VStack width="100%" overflowY="auto" maxH="60vh">
                                        {selectedRoute.map((route: item, index: number) => (
                                            <HStack key={index} justifyContent="space-between" width="100%" mb="1rem">
                                                <VStack align="flex-start">
                                                    <Text>{route.station_name}</Text>
                                                    <Text>{route.line_name}</Text>
                                                    <Text>{route.agency}</Text>
                                                </VStack>
                                                <VStack align="flex-end">
                                                    <Text>{route.time}</Text>
                                                    <Text>{route.day}</Text>
                                                </VStack>
                                            </HStack>
                                        ))}
                                    </VStack>
                                ) : ""}
                            </VStack>
                        </form>
                    </Box>
                )}
            </VStack>
        </HStack>
    );
}

export default Favorites;
