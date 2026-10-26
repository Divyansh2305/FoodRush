const { spawn } = require("child_process");
const path = require("path");
const projectDir = __dirname;
const node = process.execPath;
const children = [];

function run(label, script, args = []) {
  const child = spawn(node, [script, ...args], { cwd: projectDir, stdio: "inherit", shell: false });
  child.on("error", (err) => console.error(`${label} failed:`, err.message));
  child.on("exit", (code) => { if (code && code !== 0) console.error(`${label} exited with code ${code}`); });
  children.push(child);
}

run("API", path.join(projectDir, "server.js"));
run("WEB", path.join(projectDir, "node_modules", "parcel", "lib", "bin.js"), ["index.html"]);

function shutdown() {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
