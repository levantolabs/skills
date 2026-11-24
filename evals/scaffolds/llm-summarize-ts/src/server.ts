import express from "express";

type Message = { from: "customer" | "agent"; text: string; at: string };

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /threads/:id/messages, GET /threads/:id ... live in other files.

app.listen(3000);
