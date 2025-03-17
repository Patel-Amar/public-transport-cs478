import { Button, Flex, HStack, VStack } from "@chakra-ui/react";
import axios from "axios";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

function Layout() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        (async () => {
            try {
                await axios.post("/api/authentication", {});
            } catch {
                navigate("/login");
            }
        })();
    }, []);

    async function logout() {
        try {
            console.log("here");
            await axios.post("/api/logout", {});
            navigate("/login");
        } catch (err) {
            console.log(err);
        }
    }

    return (
        <Flex minH="100vh" alignItems="stretch" backgroundColor="#171923">
            <VStack>
                <HStack align="start" bg={"gray"} w="full" width="100vw" overflow="hidden">
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/home")}
                        bg={location.pathname === "/home" ? "gray.700" : "transparent"}
                    >
                        Home
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        _hover={{ bg: "gray.700" }}
                        onClick={() => navigate("/favorites")}
                        bg={location.pathname === "/favorites" ? "gray.700" : "transparent"}
                    >
                        Favorites
                    </Button>
                    <Button
                        variant="ghost"
                        justifyContent="flex-start"
                        _hover={{ bg: "gray.700" }}
                        onClick={logout}
                    >
                        Logout
                    </Button>
                </HStack>

                <Outlet />
            </VStack>
        </Flex >
    );
}

export default Layout;
