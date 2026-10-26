const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const HOST = process.env.API_HOST || "0.0.0.0";
const SESSION_SECRET =
  process.env.FOODRUSH_SESSION_SECRET ||
  "foodrush-local-v3-change-this-secret";

const USERS_FILE = path.join(__dirname, "data", "users.json");
const DIST_DIR = path.join(__dirname, "dist");

const NOMINATIM = "https://nominatim.openstreetmap.org";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const cache = new Map();
const rate = new Map();
const otpChallenges = new Map();

let lastNominatimAt = 0;

const RATE_WINDOW = 60_000;
const RATE_LIMIT = 100;

// --------------------------------------------------
// FILE / DATA SETUP
// --------------------------------------------------

fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]");
}

// --------------------------------------------------
// USER HELPERS
// --------------------------------------------------

const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "[]");
  } catch (_) {
    return [];
  }
};

const writeUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const safeUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: !!u.emailVerified,
        phoneVerified: !!u.phoneVerified,
        createdAt: u.createdAt,
      }
    : null;

const hashPassword = (
  password,
  salt = crypto.randomBytes(16).toString("hex")
) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex"),
});

const verifyPassword = (password, user) => {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(user.passwordHash, "hex"),
      crypto.scryptSync(password, user.passwordSalt, 64)
    );
  } catch (_) {
    return false;
  }
};

// --------------------------------------------------
// SESSION TOKEN
// --------------------------------------------------

const b64 = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

const sign = (value) =>
  crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");

const createToken = (user) => {
  const payload = b64({
    sub: user.id,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return `${payload}.${sign(payload)}`;
};

const verifyToken = (token) => {
  if (!token) return null;

  const [payload, signature] = token.split(".");

  if (!payload || !signature) return null;

  if (sign(payload) !== signature) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    if (data.exp < Date.now()) return null;

    return readUsers().find((u) => u.id === data.sub) || null;
  } catch (_) {
    return null;
  }
};

const authUser = (req) =>
  verifyToken(
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "")
  );

// --------------------------------------------------
// REQUEST HELPERS
// --------------------------------------------------

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1e6) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });

const send = (
  res,
  status,
  data,
  cacheControl = "no-store"
) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,Authorization",
    "Cache-Control": cacheControl,
  });

  res.end(JSON.stringify(data));
};

// --------------------------------------------------
// RATE LIMIT
// --------------------------------------------------

const allow = (ip) => {
  const now = Date.now();

  const row = rate.get(ip) || {
    start: now,
    count: 0,
  };

  if (now - row.start > RATE_WINDOW) {
    row.start = now;
    row.count = 0;
  }

  row.count += 1;
  rate.set(ip, row);

  return row.count <= RATE_LIMIT;
};

// --------------------------------------------------
// CACHE / FETCH
// --------------------------------------------------

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const cached = async (key, ttl, fn) => {
  const hit = cache.get(key);

  if (hit && Date.now() - hit.at < ttl) {
    return hit.data;
  }

  const data = await fn();

  cache.set(key, {
    at: Date.now(),
    data,
  });

  if (cache.size > 300) {
    [...cache.entries()]
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, 50)
      .forEach(([key]) => cache.delete(key));
  }

  return data;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent":
        "FoodRush/3.0 (contact: care@foodrush.app)",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {}

  if (!response.ok) {
    throw new Error(
      `Upstream returned ${response.status}`
    );
  }

  return data;
};

// --------------------------------------------------
// LOCATION SERVICES
// --------------------------------------------------

const throttleNominatim = async () => {
  const wait = Math.max(
    0,
    1100 - (Date.now() - lastNominatimAt)
  );

  if (wait) {
    await sleep(wait);
  }

  lastNominatimAt = Date.now();
};

const geocode = (query) =>
  cached(
    `geo:${query.toLowerCase()}`,
    24 * 60 * 60 * 1000,
    async () => {
      await throttleNominatim();

      return fetchJson(
        `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&addressdetails=1&q=${encodeURIComponent(
          query
        )}`
      );
    }
  );

const reverse = (lat, lon) =>
  cached(
    `rev:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    24 * 60 * 60 * 1000,
    async () => {
      await throttleNominatim();

      return fetchJson(
        `${NOMINATIM}/reverse?format=jsonv2&lat=${encodeURIComponent(
          lat
        )}&lon=${encodeURIComponent(
          lon
        )}&zoom=14&addressdetails=1`
      );
    }
  );

const nearby = (lat, lon, radius = 7000) =>
  cached(
    `near:${lat.toFixed(3)}:${lon.toFixed(
      3
    )}:${radius}`,
    10 * 60 * 1000,
    async () => {
      const query = `
[out:json][timeout:30];
(
  nwr(around:${radius},${lat},${lon})
  [amenity~"^(restaurant|fast_food|cafe|food_court)$"];
);
out center tags;
`;

      let lastError;

      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          return await fetchJson(endpoint, {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: `data=${encodeURIComponent(query)}`,
          });
        } catch (error) {
          lastError = error;
        }
      }

      throw (
        lastError ||
        new Error("Nearby service unavailable")
      );
    }
  );

// --------------------------------------------------
// OTP
// --------------------------------------------------

const issueOtp = (userId, purpose, channel) => {
  const id = crypto.randomUUID();

  const code = String(
    crypto.randomInt(100000, 1000000)
  );

  otpChallenges.set(id, {
    userId,
    purpose,
    channel,
    code,
    expires: Date.now() + 5 * 60 * 1000,
  });

  setTimeout(() => {
    otpChallenges.delete(id);
  }, 6 * 60 * 1000);

  return {
    id,
    code,
  };
};

const verifyChallenge = (
  id,
  code,
  purpose
) => {
  const challenge = otpChallenges.get(id);

  if (
    !challenge ||
    challenge.purpose !== purpose ||
    challenge.code !== code ||
    challenge.expires < Date.now()
  ) {
    return null;
  }

  otpChallenges.delete(id);

  return challenge;
};

// --------------------------------------------------
// FRONTEND STATIC SERVING
// --------------------------------------------------

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const serveFile = (res, filePath) => {
  if (
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    return false;
  }

  const ext = path
    .extname(filePath)
    .toLowerCase();

  const isHtml = ext === ".html";

  res.writeHead(200, {
    "Content-Type":
      MIME_TYPES[ext] ||
      "application/octet-stream",

    "Cache-Control": isHtml
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });

  fs.createReadStream(filePath).pipe(res);

  return true;
};

const serveFrontend = (
  pathname,
  res
) => {
  if (!fs.existsSync(DIST_DIR)) {
    return false;
  }

  let requestedPath =
    pathname === "/"
      ? "/index.html"
      : pathname;

  try {
    requestedPath =
      decodeURIComponent(requestedPath);
  } catch (_) {}

  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");

  const filePath = path.join(
    DIST_DIR,
    safePath
  );

  // CSS / JS / images / favicon
  if (serveFile(res, filePath)) {
    return true;
  }

  // React Router fallback
  return serveFile(
    res,
    path.join(
      DIST_DIR,
      "index.html"
    )
  );
};

// --------------------------------------------------
// SERVER
// --------------------------------------------------

const server = http.createServer(
  async (req, res) => {
    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }

    const ip =
      req.socket.remoteAddress ||
      "unknown";

    if (!allow(ip)) {
      return send(res, 429, {
        error:
          "Too many requests. Please try again shortly.",
      });
    }

    const url = new URL(
      req.url,
      `http://${req.headers.host}`
    );

    try {
      // -------------------------------
      // HEALTH
      // -------------------------------

      if (
        url.pathname ===
        "/api/health"
      ) {
        return send(
          res,
          200,
          {
            ok: true,
            app: "FoodRush",
            version: "4.0",
          },
          "public,max-age=30"
        );
      }

      // -------------------------------
      // REGISTER
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/register" &&
        req.method === "POST"
      ) {
        const body =
          await readBody(req);

        const email = String(
          body.email || ""
        )
          .trim()
          .toLowerCase();

        const phone = String(
          body.phone || ""
        ).replace(/\D/g, "");

        if (
          String(
            body.name || ""
          ).trim().length < 2 ||
          !/^\S+@\S+\.\S+$/.test(
            email
          ) ||
          !/^[6-9]\d{9}$/.test(
            phone
          ) ||
          String(
            body.password || ""
          ).length < 8
        ) {
          return send(res, 400, {
            error:
              "Invalid account details.",
          });
        }

        const users =
          readUsers();

        if (
          users.some(
            (user) =>
              user.email === email ||
              user.phone === phone
          )
        ) {
          return send(res, 409, {
            error:
              "An account already exists with this email or mobile number.",
          });
        }

        const password =
          hashPassword(
            body.password
          );

        const user = {
          id: `fr-${Date.now()}-${crypto
            .randomBytes(3)
            .toString("hex")}`,

          name: body.name.trim(),
          email,
          phone,

          passwordSalt:
            password.salt,

          passwordHash:
            password.hash,

          emailVerified: false,
          phoneVerified: false,

          createdAt:
            new Date().toISOString(),
        };

        users.push(user);

        writeUsers(users);

        return send(res, 201, {
          user: safeUser(user),
          token:
            createToken(user),
        });
      }

      // -------------------------------
      // LOGIN
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/login" &&
        req.method === "POST"
      ) {
        const body =
          await readBody(req);

        const identity =
          String(
            body.identity || ""
          )
            .trim()
            .toLowerCase();

        const digits =
          String(
            body.identity || ""
          ).replace(/\D/g, "");

        const user =
          readUsers().find(
            (item) =>
              item.email ===
                identity ||
              item.phone === digits
          );

        if (
          !user ||
          !verifyPassword(
            String(
              body.password ||
                ""
            ),
            user
          )
        ) {
          return send(res, 401, {
            error:
              "Incorrect email/mobile or password.",
          });
        }

        return send(res, 200, {
          user: safeUser(user),

          token:
            createToken(user),
        });
      }

      // -------------------------------
      // CURRENT USER
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/me" &&
        req.method === "GET"
      ) {
        const user =
          authUser(req);

        return user
          ? send(res, 200, {
              user:
                safeUser(user),
            })
          : send(res, 401, {
              error:
                "Session expired",
            });
      }

      // -------------------------------
      // PROFILE UPDATE
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/profile" &&
        req.method === "PATCH"
      ) {
        const user =
          authUser(req);

        if (!user) {
          return send(res, 401, {
            error:
              "Unauthorized",
          });
        }

        const body =
          await readBody(req);

        const users =
          readUsers();

        const index =
          users.findIndex(
            (item) =>
              item.id === user.id
          );

        const email = String(
          body.email ??
            user.email
        )
          .trim()
          .toLowerCase();

        const phone = String(
          body.phone ??
            user.phone
        ).replace(/\D/g, "");

        if (
          users.some(
            (item, i) =>
              i !== index &&
              (item.email === email ||
                item.phone === phone)
          )
        ) {
          return send(res, 409, {
            error:
              "Email or mobile is already in use.",
          });
        }

        users[index] = {
          ...users[index],

          name: String(
            body.name ??
              user.name
          ).trim(),

          email,
          phone,

          emailVerified:
            body.email === undefined
              ? user.emailVerified
              : false,

          phoneVerified:
            body.phone === undefined
              ? user.phoneVerified
              : false,
        };

        writeUsers(users);

        return send(res, 200, {
          user:
            safeUser(
              users[index]
            ),
        });
      }

      // -------------------------------
      // CHANGE PASSWORD
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/password" &&
        req.method === "POST"
      ) {
        const user =
          authUser(req);

        if (!user) {
          return send(res, 401, {
            error:
              "Unauthorized",
          });
        }

        const body =
          await readBody(req);

        if (
          !verifyPassword(
            String(
              body.currentPassword ||
                ""
            ),
            user
          )
        ) {
          return send(res, 400, {
            error:
              "Current password is incorrect.",
          });
        }

        if (
          String(
            body.newPassword ||
              ""
          ).length < 8
        ) {
          return send(res, 400, {
            error:
              "New password must be at least 8 characters.",
          });
        }

        const users =
          readUsers();

        const index =
          users.findIndex(
            (item) =>
              item.id === user.id
          );

        const password =
          hashPassword(
            body.newPassword
          );

        users[index].passwordSalt =
          password.salt;

        users[index].passwordHash =
          password.hash;

        writeUsers(users);

        return send(res, 200, {
          ok: true,
        });
      }

      // -------------------------------
      // DELETE ACCOUNT
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/account" &&
        req.method === "DELETE"
      ) {
        const user =
          authUser(req);

        if (!user) {
          return send(res, 401, {
            error:
              "Unauthorized",
          });
        }

        writeUsers(
          readUsers().filter(
            (item) =>
              item.id !== user.id
          )
        );

        return send(res, 200, {
          ok: true,
        });
      }

      // -------------------------------
      // OTP REQUEST
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/otp/request" &&
        req.method === "POST"
      ) {
        const body =
          await readBody(req);

        const identity =
          String(
            body.identity || ""
          )
            .trim()
            .toLowerCase();

        const digits =
          String(
            body.identity || ""
          ).replace(/\D/g, "");

        const user =
          readUsers().find(
            (item) =>
              item.email ===
                identity ||
              item.phone === digits
          );

        if (!user) {
          return send(res, 404, {
            error:
              "No account found.",
          });
        }

        const challenge =
          issueOtp(
            user.id,
            body.purpose ||
              "login",
            body.channel ||
              "phone"
          );

        return send(res, 200, {
          challengeId:
            challenge.id,

          // DEV OTP
          // Remove when real SMS/email OTP is connected.
          code: challenge.code,

          expiresIn: 300,
        });
      }

      // -------------------------------
      // OTP LOGIN
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/otp/login" &&
        req.method === "POST"
      ) {
        const body =
          await readBody(req);

        const challenge =
          verifyChallenge(
            body.challengeId,
            String(
              body.code || ""
            ),
            "login"
          );

        if (!challenge) {
          return send(res, 400, {
            error:
              "Invalid or expired verification code.",
          });
        }

        const users =
          readUsers();

        const index =
          users.findIndex(
            (item) =>
              item.id ===
              challenge.userId
          );

        if (index < 0) {
          return send(res, 404, {
            error:
              "Account not found.",
          });
        }

        users[index].phoneVerified =
          true;

        writeUsers(users);

        return send(res, 200, {
          user:
            safeUser(
              users[index]
            ),

          token:
            createToken(
              users[index]
            ),
        });
      }

      // -------------------------------
      // PASSWORD RESET
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/reset" &&
        req.method === "POST"
      ) {
        const body =
          await readBody(req);

        const challenge =
          verifyChallenge(
            body.challengeId,
            String(
              body.code || ""
            ),
            "reset"
          );

        if (!challenge) {
          return send(res, 400, {
            error:
              "Invalid or expired verification code.",
          });
        }

        if (
          String(
            body.newPassword ||
              ""
          ).length < 8
        ) {
          return send(res, 400, {
            error:
              "Password must be at least 8 characters.",
          });
        }

        const users =
          readUsers();

        const index =
          users.findIndex(
            (item) =>
              item.id ===
              challenge.userId
          );

        if (index < 0) {
          return send(res, 404, {
            error:
              "Account not found.",
          });
        }

        const password =
          hashPassword(
            body.newPassword
          );

        users[index].passwordSalt =
          password.salt;

        users[index].passwordHash =
          password.hash;

        writeUsers(users);

        return send(res, 200, {
          ok: true,
        });
      }

      // -------------------------------
      // VERIFY REQUEST
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/verify/request" &&
        req.method === "POST"
      ) {
        const user =
          authUser(req);

        if (!user) {
          return send(res, 401, {
            error:
              "Unauthorized",
          });
        }

        const body =
          await readBody(req);

        const channel =
          body.channel === "phone"
            ? "phone"
            : "email";

        const challenge =
          issueOtp(
            user.id,
            "verify",
            channel
          );

        return send(res, 200, {
          challengeId:
            challenge.id,

          code:
            challenge.code,

          expiresIn: 300,
        });
      }

      // -------------------------------
      // VERIFY CONFIRM
      // -------------------------------

      if (
        url.pathname ===
          "/api/auth/verify/confirm" &&
        req.method === "POST"
      ) {
        const user =
          authUser(req);

        if (!user) {
          return send(res, 401, {
            error:
              "Unauthorized",
          });
        }

        const body =
          await readBody(req);

        const challenge =
          verifyChallenge(
            body.challengeId,
            String(
              body.code || ""
            ),
            "verify"
          );

        if (
          !challenge ||
          challenge.userId !==
            user.id
        ) {
          return send(res, 400, {
            error:
              "Invalid or expired verification code.",
          });
        }

        const users =
          readUsers();

        const index =
          users.findIndex(
            (item) =>
              item.id === user.id
          );

        if (
          challenge.channel ===
          "phone"
        ) {
          users[
            index
          ].phoneVerified = true;
        } else {
          users[
            index
          ].emailVerified = true;
        }

        writeUsers(users);

        return send(res, 200, {
          user:
            safeUser(
              users[index]
            ),
        });
      }

      // -------------------------------
      // GEOCODE
      // -------------------------------

      if (
        url.pathname ===
        "/api/geocode"
      ) {
        const query =
          (
            url.searchParams.get(
              "q"
            ) || ""
          ).trim();

        if (!query) {
          return send(res, 400, {
            error: "Missing q",
          });
        }

        const data =
          await geocode(query);

        return send(
          res,
          200,
          data,
          "public,max-age=3600"
        );
      }

      // -------------------------------
      // REVERSE GEOCODE
      // -------------------------------

      if (
        url.pathname ===
        "/api/reverse"
      ) {
        const lat = Number(
          url.searchParams.get(
            "lat"
          )
        );

        const lon = Number(
          url.searchParams.get(
            "lon"
          )
        );

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon)
        ) {
          return send(res, 400, {
            error:
              "Invalid coordinates",
          });
        }

        const data =
          await reverse(lat, lon);

        return send(
          res,
          200,
          data,
          "public,max-age=3600"
        );
      }

      // -------------------------------
      // NEARBY RESTAURANTS
      // -------------------------------

      if (
        url.pathname ===
        "/api/nearby"
      ) {
        const lat = Number(
          url.searchParams.get(
            "lat"
          )
        );

        const lon = Number(
          url.searchParams.get(
            "lon"
          )
        );

        const radius =
          Math.min(
            Math.max(
              Number(
                url.searchParams.get(
                  "radius"
                )
              ) || 7000,
              1000
            ),
            15000
          );

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon)
        ) {
          return send(res, 400, {
            error:
              "Invalid coordinates",
          });
        }

        const data =
          await nearby(
            lat,
            lon,
            radius
          );

        return send(
          res,
          200,
          data,
          "public,max-age=300"
        );
      }

      // --------------------------------------------------
      // FRONTEND
      // --------------------------------------------------

      if (
        !url.pathname.startsWith(
          "/api/"
        )
      ) {
        if (
          serveFrontend(
            url.pathname,
            res
          )
        ) {
          return;
        }

        return send(res, 500, {
          error:
            "Frontend build not found. Run npm run build first.",
        });
      }

      // API fallback
      return send(res, 404, {
        error:
          "API route not found",
      });
    } catch (error) {
      console.error(error);

      return send(res, 500, {
        error:
          "FoodRush service temporarily unavailable",
      });
    }
  }
);

// --------------------------------------------------
// SERVER ERROR
// --------------------------------------------------

server.on("error", (error) => {
  if (
    error.code ===
    "EADDRINUSE"
  ) {
    console.error(
      `Port ${PORT} is already in use.`
    );
  } else {
    console.error(error);
  }

  process.exit(1);
});

// --------------------------------------------------
// START
// --------------------------------------------------

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `FoodRush running on http://${HOST}:${PORT}`
    );

    console.log(
      `Frontend directory: ${DIST_DIR}`
    );
  }
);