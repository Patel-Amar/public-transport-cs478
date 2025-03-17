import * as argon2 from "argon2";
import crypto from "crypto";
import Database from "better-sqlite3";
import * as url from "url";
import express, {
    Request,
    Response,
    CookieOptions,
} from "express";
import path from "path";
import { authorize } from './middleware.js';

let cookieOptions: CookieOptions = {
    httpOnly: false,
    secure: true,
    sameSite: "strict",
};

type account = {
    id: number,
    token: string,
    username: string,
    password: string
}

let router = express.Router();

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, "database.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

router.post("/signup", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res
            .status(400)
            .json({ error: "Username and password are required." });
    }

    try {
        const account = db.prepare("SELECT * FROM users WHERE username = ?")
        const existingUser = account.get(username);

        if (existingUser) {
            return res
                .status(400)
                .json({ error: "Username already taken." });
        }

        const hashedPassword = await argon2.hash(password);
        const token = generateToken();

        const stmt = db.prepare("INSERT INTO users (username, password, token) VALUES (?, ?, ?)")
        stmt.run(username, hashedPassword, token);

        res.cookie("auth_token", token, { httpOnly: true });
        res.json({ message: "User registered successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.post("/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res
            .status(400)
            .json({ error: "Username and password are required." });
    }

    try {
        const account = db.prepare("SELECT * FROM users WHERE username = ?")
        const user = (account.get(username) as account);

        if (!user || !(await argon2.verify(user.password, password))) {
            return res
                .status(401)
                .json({ error: "Invalid username or password." });
        }

        const token = generateToken();
        const update = db.prepare("UPDATE users SET token = ? WHERE id = ?");
        update.run(token, user.id);

        res.cookie("auth_token", token, cookieOptions);
        res.json({ message: "Login successful." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.post("/logout", async (req: Request, res: Response) => {
    let { token } = req.cookies;
    const stmt = db.prepare("UPDATE users SET token = NULL WHERE token = ?");
    stmt.run(token);
    return res.clearCookie("auth_token", cookieOptions).send();
});

function authenticateUser(req: Request, res: Response) {
    res.status(200).json();
}

router.post("/authentication", authorize, authenticateUser);

export default router;
