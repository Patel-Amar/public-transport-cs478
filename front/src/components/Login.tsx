import { useState } from "react";
import { Box, VStack, Text, Input, Button } from "@chakra-ui/react";
import "./Login.css";
import { useNavigate } from "react-router-dom";

function Login() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const navigate = useNavigate();

    const handleAuth = async (endpoint: "login" | "signup") => {
        setError("");
        setMessage("");
        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error);
            } else {
                navigate("/home");

            }
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        }
    };

    return (
        <Box height="100vh" bgAttachment="fixed" alignItems="center" display={"flex"} justifyContent="center" bgImage="url(/train-background.jpg)" backgroundSize={"cover"}>
            <VStack align="stretch" w={"50%"}>
                <Input
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    bg="#0F1016"
                    border="1px solid white"
                    opacity={"50%"}
                />
                <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    bg="#0F1016"
                    border="1px solid white"
                    opacity={"50%"}
                />

                <Box mb={4}>
                    {error && <Text color="red.400">{error}</Text>}
                    {message && <Text color="green.400">{message}</Text>}
                </Box>

                <Button colorScheme="gray" onClick={() => handleAuth("login")} flex="1" paddingTop={1} paddingBottom={1}>Log in</Button>
                <Button colorScheme="gray" onClick={() => handleAuth("signup")} flex="1" paddingTop={1} paddingBottom={1}>Sign up</Button>
            </VStack>
        </Box>
    );
}

export default Login;
