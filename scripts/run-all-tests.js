const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testsDir = path.join(__dirname, "..", "tests");
const testFiles = fs.readdirSync(testsDir).filter((f) => f.endsWith(".ts"));

console.log(`🚀 Running ${testFiles.length} test suites...\n`);

let passedSuites = 0;
let failedSuites = 0;

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  process.stdout.write(`▶ ${file}... `);
  try {
    execSync(`npx tsx "${filePath}"`, {
      stdio: "pipe",
      env: process.env,
    });
    console.log("PASSED ✅");
    passedSuites++;
  } catch (err) {
    console.log("FAILED ❌");
    console.error(err.stdout?.toString() || err.stderr?.toString() || err.message);
    failedSuites++;
  }
}

console.log(`\n========================================`);
console.log(`Suites Summary: ${passedSuites} Passed, ${failedSuites} Failed out of ${testFiles.length}`);
console.log(`========================================`);

if (failedSuites > 0) {
  process.exit(1);
}
