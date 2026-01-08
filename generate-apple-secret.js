import jwt from "jsonwebtoken";
import fs from "fs";

const TEAM_ID = "2SVC28W74K";
const KEY_ID = "2Y9QCJS4VH";
const CLIENT_ID = "com.jeomlee.dotoring.login";

const privateKey = fs.readFileSync("./AuthKey_2Y9QCJS4VH.p8");

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180, // 180 days
    aud: "https://appleid.apple.com",
    sub: CLIENT_ID,
  },
  privateKey,
  {
    algorithm: "ES256",
    keyid: KEY_ID,
  }
);

console.log(token);
