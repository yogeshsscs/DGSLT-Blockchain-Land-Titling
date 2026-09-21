// benchmark_dgss.js

const dgss = require("../dgss");
const fs = require("fs");
const { performance } = require("perf_hooks");

// ========================================
// CONFIGURATION
// ========================================

const ITERATIONS = 1000;

// ========================================
// HELPERS
// ========================================

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function saveCSV(results) {

  let csv =
    "Iteration,Init(ms),CertVerify(ms),Sign(ms),Verify(ms),Identify(ms)\n";

  results.forEach((r, i) => {

    csv +=
      `${i + 1},${r.init},${r.certVerify},${r.sign},${r.verify},${r.identify}\n`;

  });

  fs.writeFileSync("dgss_results.csv", csv);

  console.log("✅ Saved dgss_results.csv");
}

// ========================================
// BENCHMARK
// ========================================

async function runBenchmark() {

  console.log("====================================");
  console.log("DGSS PERFORMANCE BENCHMARK");
  console.log("====================================");

  const initTimes = [];
  const certVerifyTimes = [];
  const signTimes = [];
  const verifyTimes = [];
  const identifyTimes = [];

  const detailedResults = [];

  for (let i = 0; i < ITERATIONS; i++) {

    // ====================================
    // INIT PHASE
    // ====================================

    let t1 = performance.now();

    const user = dgss.keygen();

    const authority1 = dgss.keygen(user.params);
    const authority2 = dgss.keygen(user.params);
    const authority3 = dgss.keygen(user.params);

    const shares = [

      dgss.rmIssue(user.y, authority1.x, user.params),

      dgss.rmIssue(user.y, authority2.x, user.params),

      dgss.rmIssue(user.y, authority3.x, user.params)

    ];

    const cert = dgss.aggregateCert(
      shares,
      user.params
    );

    let t2 = performance.now();

    const initTime = t2 - t1;

    // ====================================
    // CERTIFICATE VERIFICATION
    // ====================================

    t1 = performance.now();

    dgss.verifyCert(
      user,
      cert,
      [
        authority1.y,
        authority2.y,
        authority3.y
      ],
      user.params
    );

    t2 = performance.now();

    const certVerifyTime = t2 - t1;

    // ====================================
    // AUDITOR / ARBITRATION MANAGER
    // ====================================

    const am = dgss.keygen(user.params);

    const message =
      `Land-Transaction-${i}`;

    // ====================================
    // SIGN
    // ====================================

    t1 = performance.now();

    const sig =
      dgss.sign(
        user,
        cert,
        am.y,
        message,
        {},
        user.params
      );

    t2 = performance.now();

    const signTime = t2 - t1;

    // ====================================
    // VERIFY
    // ====================================

    t1 = performance.now();

    const verifyResult =
      dgss.verify(
        sig,
        am.x,
        [
          authority1.y,
          authority2.y,
          authority3.y
        ],
        message,
        user.params
      );

    t2 = performance.now();

    const verifyTime = t2 - t1;

    if (!verifyResult.valid) {

      console.warn(
        `Verification failed at iteration ${i}`
      );

    }

    // ====================================
    // IDENTIFY
    // ====================================

    const candidateList = [

      {
        id: "Owner-1",
        y: user.y,
        k_sum: cert.k_sum
      },

      {
        id: "Owner-2",
        y: dgss.keygen(user.params).y,
        k_sum: cert.k_sum
      },

      {
        id: "Owner-3",
        y: dgss.keygen(user.params).y,
        k_sum: cert.k_sum
      }

    ];

    t1 = performance.now();

    dgss.identify(
      sig,
      candidateList,
      user.params
    );

    t2 = performance.now();

    const identifyTime = t2 - t1;

    // ====================================
    // STORE
    // ====================================

    initTimes.push(initTime);
    certVerifyTimes.push(certVerifyTime);
    signTimes.push(signTime);
    verifyTimes.push(verifyTime);
    identifyTimes.push(identifyTime);

    detailedResults.push({

      init: initTime.toFixed(6),

      certVerify:
        certVerifyTime.toFixed(6),

      sign:
        signTime.toFixed(6),

      verify:
        verifyTime.toFixed(6),

      identify:
        identifyTime.toFixed(6)

    });

  }

  // ====================================
  // SUMMARY
  // ====================================

  console.log("\n====================================");
  console.log("AVERAGE RESULTS");
  console.log("====================================");

  console.table({

    "Certificate Generation (Init)":

      avg(initTimes).toFixed(4) + " ms",

    "Certificate Verification":

      avg(certVerifyTimes).toFixed(4) + " ms",

    "DGSS Sign":

      avg(signTimes).toFixed(4) + " ms",

    "DGSS Verify":

      avg(verifyTimes).toFixed(4) + " ms",

    "DGSS Identify":

      avg(identifyTimes).toFixed(4) + " ms"

  });

  // ====================================
  // SAVE CSV
  // ====================================

  saveCSV(detailedResults);

  const summaryCSV =
    `Metric,Average(ms)\n` +
    `Init,${avg(initTimes)}\n` +
    `CertVerify,${avg(certVerifyTimes)}\n` +
    `Sign,${avg(signTimes)}\n` +
    `Verify,${avg(verifyTimes)}\n` +
    `Identify,${avg(identifyTimes)}\n`;

  fs.writeFileSync(
    "dgss_summary.csv",
    summaryCSV
  );

  console.log(
    "✅ Saved dgss_summary.csv"
  );

  console.log("\nBenchmark Completed.");
}

// ========================================
// RUN
// ========================================

runBenchmark().catch(console.error);