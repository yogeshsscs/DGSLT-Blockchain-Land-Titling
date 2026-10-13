const fs = require("fs");
const path = require("path");
const dgss = require("../dgss");

const CONFIG = {
  iterations: Number(process.env.DGSS_ITERATIONS) || 10000,
  warmupIterations: Number(process.env.DGSS_WARMUP_ITERATIONS) || 1000,
  outputDir: process.env.DGSS_OUTPUT_DIR || process.cwd()
};

const OPERATIONS = [
  "Key Generation",
  "Registration Manager Certificate Issuance",
  "Certificate Aggregation",
  "Certificate Verification",
  "Signature Generation",
  "Signature Verification",
  "Identity Revelation"
];

function nowNs() {
  return process.hrtime.bigint();
}

function nsToMs(ns) {
  return Number(ns) / 1e6;
}

function formatNumber(value, decimals = 6) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function median(sortedValues) {
  if (sortedValues.length === 0) return 0;
  const middle = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
  }

  return sortedValues[middle];
}

function stdDev(values, average) {
  if (values.length <= 1) return 0;

  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function createMetrics() {
  return Object.fromEntries(
    OPERATIONS.map(operation => [
      operation,
      {
        times: [],
        cpuUser: 0,
        cpuSystem: 0,
        heap: 0,
        rss: 0
      }
    ])
  );
}

function recordOperation(metrics, operation, fn) {
  const cpuStart = process.cpuUsage();
  const start = nowNs();

  const result = fn();

  const elapsedMs = nsToMs(nowNs() - start);
  const cpu = process.cpuUsage(cpuStart);
  const memory = process.memoryUsage();

  metrics[operation].times.push(elapsedMs);
  metrics[operation].cpuUser += cpu.user;
  metrics[operation].cpuSystem += cpu.system;
  metrics[operation].heap = Math.max(metrics[operation].heap, memory.heapUsed);
  metrics[operation].rss = Math.max(metrics[operation].rss, memory.rss);

  return {
    result,
    elapsedMs
  };
}

function runIteration(metrics, iteration, shouldRecord) {
  const localMetrics = shouldRecord ? metrics : createMetrics();
  let measured;

  measured = recordOperation(localMetrics, "Key Generation", () => {
    const user = dgss.keygen();
    const authorities = [
      dgss.keygen(user.params),
      dgss.keygen(user.params),
      dgss.keygen(user.params)
    ];
    const am = dgss.keygen(user.params);

    return {
      user,
      authorities,
      am
    };
  });

  const { user, authorities, am } = measured.result;
  const authorityPublicKeys = authorities.map(authority => authority.y);

  measured = recordOperation(
    localMetrics,
    "Registration Manager Certificate Issuance",
    () =>
      authorities.map(authority =>
        dgss.rmIssue(user.y, authority.x, user.params)
      )
  );

  const shares = measured.result;

  measured = recordOperation(localMetrics, "Certificate Aggregation", () =>
    dgss.aggregateCert(shares, user.params)
  );

  const cert = measured.result;

  measured = recordOperation(localMetrics, "Certificate Verification", () =>
    dgss.verifyCert(user, cert, authorityPublicKeys, user.params)
  );

  const certValid = measured.result;
  const message = `Land-Transaction-${iteration}`;

  measured = recordOperation(localMetrics, "Signature Generation", () =>
    dgss.sign(user, cert, am.y, message, {}, user.params)
  );

  const signature = measured.result;

  measured = recordOperation(localMetrics, "Signature Verification", () =>
    dgss.verify(signature, am.x, authorityPublicKeys, message, user.params)
  );

  const verifyResult = measured.result;

  const candidates = [
    {
      id: "Owner-1",
      y: user.y,
      k_sum: cert.k_sum
    },
    {
      id: "Owner-2",
      y: authorities[0].y,
      k_sum: cert.k_sum
    },
    {
      id: "Owner-3",
      y: authorities[1].y,
      k_sum: cert.k_sum
    }
  ];

  measured = recordOperation(localMetrics, "Identity Revelation", () =>
    dgss.identify(signature, candidates, user.params)
  );

  return {
    certValid,
    signatureValid: verifyResult.valid,
    identifiedOwner: measured.result
  };
}

function summarizeOperation(operation, metrics) {
  const values = [...metrics.times].sort((a, b) => a - b);
  const iterations = values.length;
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  const average = iterations > 0 ? totalMs / iterations : 0;

  return {
    Operation: operation,
    Iterations: iterations,
    "Average(ms)": formatNumber(average),
    "Median(ms)": formatNumber(median(values)),
    "P95(ms)": formatNumber(percentile(values, 95)),
    "P99(ms)": formatNumber(percentile(values, 99)),
    "Min(ms)": formatNumber(iterations > 0 ? values[0] : 0),
    "Max(ms)": formatNumber(iterations > 0 ? values[iterations - 1] : 0),
    "StdDev(ms)": formatNumber(stdDev(values, average)),
    "Throughput(ops/sec)": formatNumber(
      totalMs > 0 ? iterations / (totalMs / 1000) : 0,
      3
    ),
    "CPU_User(us)": metrics.cpuUser,
    "CPU_System(us)": metrics.cpuSystem,
    "Heap(MB)": formatNumber(metrics.heap / 1024 / 1024, 3),
    "RSS(MB)": formatNumber(metrics.rss / 1024 / 1024, 3)
  };
}

function csvEscape(value) {
  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function writeCSV(filename, headers, rows) {
  const csv = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(header => csvEscape(row[header] ?? "")).join(",")
    )
  ].join("\n");

  fs.writeFileSync(filename, csv + "\n", "utf8");
}

function benchmark() {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  console.log("====================================");
  console.log("DGSS OPERATION BENCHMARK");
  console.log("====================================");
  console.log(`Warm-up iterations : ${CONFIG.warmupIterations}`);
  console.log(`Measured iterations: ${CONFIG.iterations}`);
  console.log(`Output directory   : ${CONFIG.outputDir}`);
  console.log("");

  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    runIteration(null, i, false);
  }

  const metrics = createMetrics();
  const detailedRows = [];
  let failedCertChecks = 0;
  let failedSignatureChecks = 0;
  let failedIdentityChecks = 0;

  for (let i = 0; i < CONFIG.iterations; i++) {
    const beforeCounts = Object.fromEntries(
      OPERATIONS.map(operation => [operation, metrics[operation].times.length])
    );

    const result = runIteration(metrics, i, true);

    if (!result.certValid) failedCertChecks++;
    if (!result.signatureValid) failedSignatureChecks++;
    if (result.identifiedOwner !== "Owner-1") failedIdentityChecks++;

    const row = {
      Iteration: i + 1,
      CertValid: result.certValid,
      SignatureValid: result.signatureValid,
      IdentifiedOwner: result.identifiedOwner
    };

    for (const operation of OPERATIONS) {
      const timingIndex = beforeCounts[operation];
      row[operation] = formatNumber(metrics[operation].times[timingIndex]);
    }

    detailedRows.push(row);

    if ((i + 1) % Math.max(1, Math.floor(CONFIG.iterations / 10)) === 0) {
      console.log(`Progress: ${i + 1}/${CONFIG.iterations}`);
    }
  }

  const summaryRows = OPERATIONS.map(operation =>
    summarizeOperation(operation, metrics[operation])
  );

  const summaryHeaders = [
    "Operation",
    "Iterations",
    "Average(ms)",
    "Median(ms)",
    "P95(ms)",
    "P99(ms)",
    "Min(ms)",
    "Max(ms)",
    "StdDev(ms)",
    "Throughput(ops/sec)",
    "CPU_User(us)",
    "CPU_System(us)",
    "Heap(MB)",
    "RSS(MB)"
  ];

  const detailedHeaders = [
    "Iteration",
    ...OPERATIONS,
    "CertValid",
    "SignatureValid",
    "IdentifiedOwner"
  ];

  const summaryPath = path.join(CONFIG.outputDir, "dgss_operation_summary.csv");
  const detailedPath = path.join(CONFIG.outputDir, "dgss_operation_detailed.csv");

  writeCSV(summaryPath, summaryHeaders, summaryRows);
  writeCSV(detailedPath, detailedHeaders, detailedRows);

  console.log("");
  console.log("Publication Summary");
  console.table(summaryRows);
  console.log(`Certificate verification failures: ${failedCertChecks}`);
  console.log(`Signature verification failures   : ${failedSignatureChecks}`);
  console.log(`Identity revelation failures      : ${failedIdentityChecks}`);
  console.log(`Summary CSV : ${summaryPath}`);
  console.log(`Detailed CSV: ${detailedPath}`);
}

benchmark();
