import express, { Response, Request } from "express";
import * as url from "url";
import Database from "better-sqlite3";
import path from "path";
import { z } from "zod"

const router = express.Router();

let __dirname = url.fileURLToPath(new URL("..", import.meta.url));
const db = new Database(path.join(__dirname, "database.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = OFF");

function parseError(zodError: z.ZodError): string[] {
    const { formErrors, fieldErrors } = zodError.flatten();
    const fieldErrorMessages = Object.values(fieldErrors).flatMap(
        (messages) => messages ?? []
    );
    return [...formErrors, ...fieldErrorMessages];
}

const getUser = db.prepare("SELECT * FROM users WHERE token = ?");

function add(req: Request, res: Response) {
    try {
        if (req.body.data === undefined) {
            return res.status(400).json({ error: "invalid" });
        }
        let { auth_token } = req.cookies;

        let resp = getUser.get(auth_token) as any;
        console.log(resp);
        let currentUserID = resp.id;

        const stmt = db.prepare("INSERT INTO favorites (user_id, route) VALUES (?, ?)")
        stmt.run(currentUserID, JSON.stringify(req.body.data));

        res.status(200).json();

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: parseError(error) });
        }
        console.error("Error adding favorited route:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

function del(req: Request, res: Response) {
    try {
        if (req.params.id === undefined) {
            return res.status(400).json({ error: "invalid" });
        }
        let { auth_token } = req.cookies;

        let resp = getUser.get(auth_token) as any;
        let currentUserID = resp.id;

        const stmt = db.prepare("DELETE FROM favorites WHERE user_id = ? AND id = ?")
        stmt.run(currentUserID, req.params.id);

        res.status(200).json();

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: parseError(error) });
        }
        console.error("Error adding favorited route:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

function getAll(req: Request, res: Response) {
    try {
        let { auth_token } = req.cookies;

        let resp = getUser.get(auth_token) as any;
        let currentUserID = resp.id;

        const stmt = db.prepare("SELECT * FROM favorites WHERE user_id = ?")
        res.status(200).json({ routes: stmt.all(currentUserID) });

    } catch (error) {
        console.error("Error retrieving favorited route:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

function getByID(req: Request, res: Response) {

}

router.post("/", add);
router.delete("/:id", del);
router.get("/", getAll);

export default router;
