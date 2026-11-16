"use strict";
const fs = require("node:fs");
const source = fs.readFileSync("server.js", "utf8");
const guardStart = source.indexOf("Never expose server-side data");
const staticStart = source.indexOf('app.use(express.static(ROOT, { extensions: ["html"] }));');
if (guardStart < 0 || staticStart < 0 || guardStart > staticStart) {
  throw new Error("Private static-file guard must run before express.static.");
}
const dataRule = source.match(/const privateDataFile = (.*);/);
const artifactRule = source.match(/const privateArtifact = (.*);/);
if (!dataRule || !artifactRule) throw new Error("Private filename rules are missing.");
const dataPattern = new RegExp(dataRule[1].slice(1, dataRule[1].lastIndexOf("/")), "i");
const artifactPattern = new RegExp(artifactRule[1].split(" || ")[0].slice(1, artifactRule[1].split(" || ")[0].lastIndexOf("/")), "i");
const envPattern = new RegExp(artifactRule[1].split(" || ")[1].slice(1, artifactRule[1].split(" || ")[1].lastIndexOf("/")), "i");
for (const name of ["orders.json","users.json","sessions.json","products.json","coupons.json","reviews.json"]) {
  if (!dataPattern.test(name)) throw new Error("Sensitive JSON file is not blocked: " + name);
}
for (const name of ["orders.json.backup","foodora.dump","snapshot.sql","archive.zip",".env",".env.production"]) {
  if (!(dataPattern.test(name) || artifactPattern.test(name) || envPattern.test(name))) {
    throw new Error("Private artifact is not blocked: " + name);
  }
}
for (const name of ["index.html","style.css","script.js","backup-center.html"]) {
  if (dataPattern.test(name) || artifactPattern.test(name) || envPattern.test(name)) {
    throw new Error("Public application asset was incorrectly blocked: " + name);
  }
}
console.log("Private filename patterns match sensitive files and preserve public application assets.");
