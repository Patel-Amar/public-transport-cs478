import { Request, Response, NextFunction } from "express";
import Database from "better-sqlite3";
import * as url from "url";
import path from "path";

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, "database.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");

export async function authorize(req: Request, res: Response, next: NextFunction) {
    let { auth_token } = req.cookies;
    if (auth_token === undefined) {
        return res.status(403).json({ error: ["Unauthorized"] });
    }

    const stmt = db.prepare("SELECT * FROM users WHERE token = ?")
    let resp = stmt.all(auth_token);
    if (!resp) {
        return res.status(403).json({ error: ["Unauthorized"] });
    }
    next();
};