
# RateGuard

A type-safe rate limiting middleware built with Node.js, Express, and TypeScript.
Supports Fixed Window and Token Bucket algorithms with Redis for high-performance request control.

---

## Overview

RateGuard is a backend middleware designed to control how many requests a client can make within a given time frame. It helps prevent abuse, protects APIs from overload, and ensures fair usage across users.

The project starts with a Fixed Window approach and evolves into a Token Bucket system for better accuracy and burst handling.

---

## Features

* Type-safe implementation using TypeScript (no `any`)
* Express middleware architecture
* Fixed Window rate limiting
* Token Bucket algorithm (advanced)
* Redis-based storage for scalability
* Configurable limits (window size, request count)
* Per-user/IP request tracking
* Clean and modular architecture

---

## How It Works

### Fixed Window

* Tracks number of requests in a fixed time window (e.g. 60 seconds)
* Resets count after the window expires
* Simple and fast, but can allow bursts at window boundaries

### Token Bucket

* Each user has a “bucket” of tokens
* Each request consumes one token
* Tokens refill over time
* Allows controlled bursts while preventing abuse

---

## Tech Stack

* Node.js
* Express
* TypeScript
* Redis (ioredis)

---

## Project Structure

```
src/
  middleware/     # rate limiter middleware
  services/       # core rate limiting logic (Redis, algorithms)
  config/         # configuration types and constants
  utils/          # helper functions
  server.ts       # entry point
```

---

## Installation

```bash
git clone https://github.com/<your-username>/rateguard.git
cd rateguard
npm install
```

---

## Running the Project

```bash
npm run dev
```

---

## Example Usage

```ts
import express from "express";
import { rateLimiter } from "./middleware/rateLimiter";

const app = express();

app.use(rateLimiter({
  windowSize: 60,
  maxRequests: 100
}));

app.get("/", (req, res) => {
  res.send("Hello World");
});
```

---

## Redis Setup (if used)

Make sure Redis is running locally or provide a connection URL:

```ts
import Redis from "ioredis";

const redis = new Redis();
```

---

## Why Redis?

* Extremely fast (in-memory)
* Supports atomic operations like `INCR`
* Built-in expiration for automatic cleanup
* Ideal for rate limiting and caching

---

## Use Cases

* API protection
* Prevent brute force attacks
* Limit abuse/spam
* Fair usage enforcement

---

## Future Improvements

* Distributed rate limiting
* CLI integration
* Analytics dashboard
* Per-route dynamic rules

---

## License

MIT
