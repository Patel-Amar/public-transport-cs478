import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from 'express-rate-limit'
import findRoute from './routes.findRoute.js'
import { populateData } from "./populateData.js";
import { buildGraph } from './BuildGraph.js';
// import { populateData } from "./populateData.js";

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

router.use("/search", findRoute);

app.use("/api", router);


// run server
let port = 3000;
let host = "localhost";
let protocol = "http";
app.listen(port, host, () => {
    console.log(`${protocol}://${host}:${port}`);
});
