const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
  quiet: true
});

function nsToMs(ns) {
  return Number(ns) / 1e6;
}

function formatNumber(value, decimals = 4) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

function parseUserCounts() {
  if (process.env.SCALABILITY_USERS) {
    return process.env.SCALABILITY_USERS.split(",")
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value) && value > 0);
  }

  return [1, 5, 10, 20, 50, 100, 200, 500];
}

function makeHash(ethers, parcelId, userIndex, txIndex) {
  return ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`LAND-${parcelId.toString()}-USER-${userIndex}-TX-${txIndex}`)
  );
}

async function getBenchmarkContract(ethers) {
  const configuredAddress =
    process.env.CONTRACT_ADDRESS ||
    "0x5fbdb2315678afecb367f032d93f642f64180aa3";

  const Factory = await ethers.getContractFactory("DGSSLandRegistry");
  const code = await ethers.provider.getCode(configuredAddress);

  if (code !== "0x") {
    console.log(`Using deployed DGSSLandRegistry at ${configuredAddress}`);
    return Factory.attach(configuredAddress);
  }

  console.log(
    `No contract found at ${configuredAddress}. Deploying DGSSLandRegistry for this benchmark run...`
  );

  const contract = await Factory.deploy();
  await contract.deployed();
  console.log(`Benchmark contract deployed at ${contract.address}`);
  return contract;
}

async function main() {
  const { ethers } = hre;

  const USER_COUNTS = parseUserCounts();
  const TX_PER_USER = Number(process.env.TX_PER_USER) || 10;
  const RUN_BASE =
    BigInt(
      Number(process.env.SCALABILITY_RUN_ID) ||
        Math.floor(Date.now() / 1000)
    ) * 100000000n;

  const contract = await getBenchmarkContract(ethers);
  const accounts = await ethers.getSigners();
  const signerLocks = accounts.map(() => Promise.resolve());
  const results = [];

  console.log("\n=====================================");
  console.log(" DGSS Scalability Benchmark Started ");
  console.log("=====================================");
  console.log(`Users tested       : ${USER_COUNTS.join(", ")}`);
  console.log(`Transactions/user  : ${TX_PER_USER}`);
  console.log("");

  for (const users of USER_COUNTS) {
    console.log(`Testing ${users} concurrent users`);

    let success = 0;
    let failed = 0;
    let totalGas = 0;
    let totalLatencyMs = 0;
    let totalQueueMs = 0;
    let totalConfirmationMs = 0;
    let firstFailure = "";

    const totalTransactions = users * TX_PER_USER;
    const cpuStart = process.cpuUsage();
    const startMemory = process.memoryUsage();
    const benchmarkStart = process.hrtime.bigint();
    const promises = [];

    for (let i = 0; i < users; i++) {
      const signerIndex = i % accounts.length;
      const signer = accounts[signerIndex];
      const userContract = contract.connect(signer);

      for (let j = 0; j < TX_PER_USER; j++) {
        const parcelId =
          RUN_BASE +
          BigInt(users) * 1000000n +
          BigInt(i) * BigInt(TX_PER_USER) +
          BigInt(j);

        const task = signerLocks[signerIndex].then(async () => {
          const transactionStart = process.hrtime.bigint();

          try {
            const submitStart = process.hrtime.bigint();
            const tx = await userContract.storeLand(
              parcelId.toString(),
              makeHash(ethers, parcelId, i, j)
            );
            const submitEnd = process.hrtime.bigint();

            const receipt = await tx.wait();
            const confirmationEnd = process.hrtime.bigint();

            const queueMs = nsToMs(submitEnd - submitStart);
            const confirmationMs = nsToMs(confirmationEnd - submitEnd);
            const latencyMs = nsToMs(confirmationEnd - transactionStart);

            totalQueueMs += queueMs;
            totalConfirmationMs += confirmationMs;
            totalLatencyMs += latencyMs;
            totalGas += Number(receipt.gasUsed);
            success++;
          } catch (err) {
            failed++;
            if (!firstFailure) {
              firstFailure = err.reason || err.message || String(err);
            }
          }
        });

        signerLocks[signerIndex] = task.catch(() => {});
        promises.push(task);
      }
    }

    await Promise.all(promises);

    const benchmarkEnd = process.hrtime.bigint();
    const cpuEnd = process.cpuUsage(cpuStart);
    const endMemory = process.memoryUsage();

    const totalTimeMs = nsToMs(benchmarkEnd - benchmarkStart);
    const avgLatency = success > 0 ? totalLatencyMs / success : 0;
    const avgQueue = success > 0 ? totalQueueMs / success : 0;
    const avgConfirmation =
      success > 0 ? totalConfirmationMs / success : 0;
    const tps = success > 0 ? success / (totalTimeMs / 1000) : 0;
    const avgGas = success > 0 ? totalGas / success : 0;
    const successRate = (success / totalTransactions) * 100;
    const cpuTotalUs = cpuEnd.user + cpuEnd.system;
    const cpuUtilization =
      totalTimeMs > 0 ? (cpuTotalUs / (totalTimeMs * 1000)) * 100 : 0;

    const row = {
      users,
      transactions: totalTransactions,
      latency: formatNumber(avgLatency),
      tps: formatNumber(tps, 2),
      avgGas: formatNumber(avgGas, 0),
      queueWait: formatNumber(avgQueue),
      confirmation: formatNumber(avgConfirmation),
      cpuUser: cpuEnd.user,
      cpuSystem: cpuEnd.system,
      cpuUtilization: formatNumber(cpuUtilization, 2),
      heap: formatNumber(endMemory.heapUsed / 1024 / 1024, 3),
      rss: formatNumber(endMemory.rss / 1024 / 1024, 3),
      heapDelta: formatNumber(
        (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024,
        3
      ),
      rssDelta: formatNumber(
        (endMemory.rss - startMemory.rss) / 1024 / 1024,
        3
      ),
      success,
      failed,
      successRate: formatNumber(successRate, 2),
      firstFailure
    };

    results.push(row);

    console.table([
      {
        Users: row.users,
        Transactions: row.transactions,
        Latency_ms: row.latency,
        TPS: row.tps,
        Queue_ms: row.queueWait,
        Confirmation_ms: row.confirmation,
        CPU_percent: row.cpuUtilization,
        Heap_MB: row.heap,
        RSS_MB: row.rss,
        Success: row.success,
        Failed: row.failed,
        SuccessRate: `${row.successRate}%`
      }
    ]);

    if (firstFailure) {
      console.log(`First failure reason: ${firstFailure}`);
    }
  }

  const headers = [
    "Users",
    "Transactions",
    "Latency(ms)",
    "TPS",
    "AverageGas",
    "QueueWaitingTime(ms)",
    "BlockConfirmationTime(ms)",
    "CPU_User(us)",
    "CPU_System(us)",
    "CPU_Utilization(%)",
    "Heap(MB)",
    "RSS(MB)",
    "HeapDelta(MB)",
    "RSSDelta(MB)",
    "SuccessfulTx",
    "FailedTx",
    "SuccessRate(%)",
    "FirstFailure"
  ];

  const csvRows = results.map(row =>
    [
      row.users,
      row.transactions,
      row.latency,
      row.tps,
      row.avgGas,
      row.queueWait,
      row.confirmation,
      row.cpuUser,
      row.cpuSystem,
      row.cpuUtilization,
      row.heap,
      row.rss,
      row.heapDelta,
      row.rssDelta,
      row.success,
      row.failed,
      row.successRate,
      `"${String(row.firstFailure).replace(/"/g, '""')}"`
    ].join(",")
  );

  const outputPath = path.join(__dirname, "scalability_results.csv");
  fs.writeFileSync(outputPath, [headers.join(","), ...csvRows].join("\n") + "\n");

  console.log("\nScalability benchmark completed.");
  console.log(`CSV saved as ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
