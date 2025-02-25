import { useState } from "react";
import { Flex, Box, VStack, Heading, Text, Input, Button } from "@chakra-ui/react";
import "./Login.css";

function Login() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

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
            if (!response.ok) throw new Error(data.error);
            setMessage(data.message);
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        }
    };

    return (
        <Flex className="login-container" height="100vh" alignItems="center" justifyContent="center">
            <Flex className="login-box" width="100%" height={"100%"} boxShadow="lg" borderRadius="lg" overflow="hidden" alignItems="center">
                <Box className="login-left" flex="1" height="100%" justifyItems="center" bg="black" color="white" p={10} textAlign="left" alignContent={"center"}>
                    <div>
                        <Heading size="7xl">SPiN.</Heading>
                        <Text fontSize="lg" mt={4}>What are you and your friends spinning?</Text>
                        <Text fontSize="sm" fontStyle="italic" mt={2}>Vinyl management with a social twist. <br></br>Please enter your details.</Text>
                    </div>
                </Box>
                <Box className="login-right" flex="1" alignContent="center" color="white" p={32} >
                    <VStack align="stretch"> {/* Increased spacing between elements */}
                        <Heading size="3xl" mb={4} >Start your spin</Heading>

                        {/* Input fields */}
                        <Input
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            bg="#0F1016"
                            border="none"
                            borderColor="#2D3748"
                        />
                        <Input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            bg="#0F1016"
                            border="none"
                            borderColor="#2D3748"
                        />

                        {/* Messages (error/success) */}
                        <Box mb={4}> {/* Added margin to the message container */}
                            {error && <Text color="red.400">{error}</Text>}
                            {message && <Text color="green.400">{message}</Text>}
                        </Box>

                        {/* Action Buttons */}
                        <Flex justifyContent="space-between" width="100%">
                            <Button colorScheme="gray" onClick={() => handleAuth("login")} flex="1" mr={2} mb={4}>Log in</Button>
                            <Button colorScheme="gray" onClick={() => handleAuth("signup")} flex="1" mb={4}>Sign up</Button>
                        </Flex>
                    </VStack>
                </Box>
            </Flex>
        </Flex>
    );
}

export default Login;
