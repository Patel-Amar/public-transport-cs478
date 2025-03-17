import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from 'express-rate-limit'
import findRoute from './routes.findRoute.js'
import loginRoute from './routes.login.js'
import { authorize } from "./middleware.js";
import favRoute from './routes.favorite.js';
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-8',
    legacyHeaders: false
});

let app = express();

app.use(limiter);
app.use(express.json());
app.use(cookieParser());

const router = express.Router();

router.use("/", loginRoute);
router.use("/favorite", authorize, favRoute);
router.use("/search", authorize, findRoute);


app.use("/api", router);

app.use(express.static(path.resolve(__dirname, '../../front/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../front/dist', 'index.html'));
});


// run server
let port = 3002;
let host = "127.0.0.1";
let protocol = "http";
app.listen(port, host, () => {
    console.log(`${protocol}://${host}:${port}`);
});
