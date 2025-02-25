import { Box, Button, Flex, VStack } from "@chakra-ui/react";
import { Outlet, useNavigate } from "react-router-dom";

function Layout() {
    const navigate = useNavigate();

    return (
        <Flex minH="100vh" alignItems="stretch" backgroundColor="#171923">
            <Box w="15%" bg="gray.800" color="white">
                <VStack align="start">
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        w="100%"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/feed")}
                    >
                        Feed
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        w="100%"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/search")}
                    >
                        Search
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        w="100%"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/collection")}
                    >
                        Collection
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        w="100%"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/friends")}
                    >
                        Friends
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        w="100%"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/wants")}
                    >
                        Wants
                    </Button>
                </VStack>
            </Box>

            <Box w="85%">
                <Outlet />
            </Box>
        </Flex >
    );
}

export default Layout;
