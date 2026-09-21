const { ethers } = require("ethers");
const dgss = require("../dgss");
const fs = require("fs");
const path = require("path");

// Load environment variables if .env exists
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
  });
} catch (e) {
  // Ignore error if dotenv is not installed or file is missing
}

function normalizePrivateKey(value) {
  if (!value) return value;
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

// ---------- CONFIG ----------
const RPC_URL = (process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545").trim();
const PRIVATE_KEY = normalizePrivateKey(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || "0x5fbdb2315678afecb367f032d93f642f64180aa3").trim();

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
  "function storeLand(uint256,string)"
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

// ---------- PARAMETERS ----------
const BLOCK_SIZE = 25;   // 20–30 transactions
const NUM_BLOCKS = 3;    // number of batches
const PARALLEL = false;  // Set to true for parallel execution (Promise.all)

// Dynamic start parcel ID using timestamp to prevent duplicate registration revert errors
const START_PARCEL_ID = Number(
  process.env.START_PARCEL_ID || Math.floor(Date.now() / 1000)
);

let results = [];

// ---------- TIME ----------
const now = () => Date.now();

// ---------- RUN ----------
async function run() {
  console.log(`🚀 Running ${NUM_BLOCKS} blocks of ${BLOCK_SIZE} transactions`);
  console.log(`📡 RPC URL: ${RPC_URL}`);
  console.log(`📝 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`🔑 Start Parcel ID: ${START_PARCEL_ID}`);
  console.log(`⚡ Execution Mode: ${PARALLEL ? "Parallel (Concurrent)" : "Sequential"}\n`);

  // DGSS setup
  const user = dgss.keygen();
  const am = dgss.keygen();

  const shares = [1, 2, 3].map(() =>
    dgss.rmIssue(user.y, dgss.keygen().x)
  );

  const cert = dgss.aggregateCert(shares);

  const allTxResults = [];
  let globalStart = now();

  for (let b = 0; b < NUM_BLOCKS; b++) {
    console.log(`\n📦 BLOCK ${b + 1}`);

    let blockStart = now();
    let promises = [];
    let blockResults = [];

    for (let i = 0; i < BLOCK_SIZE; i++) {
      const index = b * BLOCK_SIZE + i;
      const parcelId = (START_PARCEL_ID + index).toString();
      const data = "Land-" + index;

      if (PARALLEL) {
        promises.push(sendTransaction(parcelId, data, user, cert, am));
      } else {
        const res = await sendTransaction(parcelId, data, user, cert, am);
        blockResults.push(res);
      }
    }

    let actualBlockResults = [];
    if (PARALLEL) {
      console.log(`⏳ Awaiting block ${b + 1} transactions parallel execution...`);
      actualBlockResults = await Promise.all(promises);
    } else {
      actualBlockResults = blockResults;
    }

    let blockEnd = now();
    const blockLatency = blockEnd - blockStart;

    allTxResults.push(...actualBlockResults);

    // ---------- BLOCK METRICS ----------
    const successfulTxs = actualBlockResults.filter(r => r.success);
    const failedTxs = actualBlockResults.filter(r => !r.success);

    const blockGasUsed = successfulTxs.reduce((sum, r) => sum + r.gas, 0);
    const avgGas = successfulTxs.length > 0 ? blockGasUsed / successfulTxs.length : 0;
    const minGas = successfulTxs.length > 0 ? Math.min(...successfulTxs.map(r => r.gas)) : 0;
    const maxGas = successfulTxs.length > 0 ? Math.max(...successfulTxs.map(r => r.gas)) : 0;

    const avgSign = actualBlockResults.length > 0 ? avg(actualBlockResults.map(r => r.signTime)) : 0;
    const avgVerify = actualBlockResults.length > 0 ? avg(actualBlockResults.map(r => r.verifyTime)) : 0;
    const avgTxLatency = successfulTxs.length > 0 ? avg(successfulTxs.map(r => r.txLatency)) : 0;

    const tps = BLOCK_SIZE / (blockLatency / 1000);

    const blockSummary = {
      block: b + 1,
      size: BLOCK_SIZE,
      latency: blockLatency,
      tps,
      totalGas: blockGasUsed,
      avgGas,
      minGas,
      maxGas,
      avgSign,
      avgVerify,
      avgTxLatency,
      successCount: successfulTxs.length,
      failCount: failedTxs.length
    };

    results.push(blockSummary);

    console.log("📊 Block Summary:", {
      Block: blockSummary.block,
      Size: blockSummary.size,
      "Latency (ms)": blockSummary.latency,
      "Throughput (TPS)": blockSummary.tps.toFixed(2),
      "Total Gas": blockSummary.totalGas,
      "Avg Gas": blockSummary.avgGas.toFixed(2),
      "Avg Sign (ms)": blockSummary.avgSign.toFixed(2),
      "Avg Verify (ms)": blockSummary.avgVerify.toFixed(2),
      "Avg Tx Latency (ms)": blockSummary.avgTxLatency.toFixed(2),
      Success: blockSummary.successCount,
      Failed: blockSummary.failCount
    });
  }

  let globalEnd = now();
  const totalDuration = globalEnd - globalStart;
  const successfulTxs = allTxResults.filter(r => r.success);
  const totalGas = successfulTxs.reduce((sum, r) => sum + r.gas, 0);

  console.log("\n⚡ Total Time:", totalDuration, "ms");
  console.log("\n=================== GLOBAL PERFORMANCE SUMMARY ===================");
  console.log(`Transactions:   ${allTxResults.length} attempted, ${successfulTxs.length} succeeded, ${allTxResults.length - successfulTxs.length} failed`);
  console.log(`Success Rate:   ${((successfulTxs.length / allTxResults.length) * 100).toFixed(2)}%`);
  console.log(`Global Duration:${(totalDuration / 1000).toFixed(2)} seconds`);
  console.log(`Overall TPS:    ${(allTxResults.length / (totalDuration / 1000)).toFixed(2)} tx/sec`);
  console.log(`Total Gas Used: ${totalGas}`);
  if (successfulTxs.length > 0) {
    console.log(`Avg Gas per Tx: ${(totalGas / successfulTxs.length).toFixed(2)}`);
    console.log(`Min Gas per Tx: ${Math.min(...successfulTxs.map(r => r.gas))}`);
    console.log(`Max Gas per Tx: ${Math.max(...successfulTxs.map(r => r.gas))}`);
    console.log(`Avg Tx Latency: ${avg(successfulTxs.map(r => r.txLatency)).toFixed(2)} ms`);
  }
  console.log(`Avg Sign Time:  ${avg(allTxResults.map(r => r.signTime)).toFixed(2)} ms`);
  console.log(`Avg Verify Time:${avg(allTxResults.map(r => r.verifyTime)).toFixed(2)} ms`);
  console.log("==================================================================\n");

  saveCSVs(allTxResults);
}

// ---------- SEND TX ----------
async function sendTransaction(parcelId, data, user, cert, am) {
  // DGSS SIGN
  let t1 = now();
  const sig = dgss.sign(user, cert, am.y, data);
  let t2 = now();

  // DGSS VERIFY
  let t3 = now();
  dgss.verify(sig, am.x);
  let t4 = now();

  // HASH
  const hash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(data)
  );

  let txLatency = 0;
  let gasUsed = 0;
  let txHash = "";
  let blockNumber = 0;
  let success = false;
  let gasPerByte = 0;

  try {
    // SEND TX
    let txStart = now();
    const tx = await contract.storeLand(
      ethers.BigNumber.from(parcelId),
      hash
    );
    const receipt = await tx.wait();
    txLatency = now() - txStart;

    gasUsed = parseInt(receipt.gasUsed.toString());
    txHash = tx.hash;
    blockNumber = receipt.blockNumber;
    success = true;
    gasPerByte = gasUsed / ethers.utils.toUtf8Bytes(hash).length;
  } catch (error) {
    console.error(`❌ Transaction for parcel ${parcelId} failed:`, error.message);
  }

  return {
    parcelId,
    signTime: t2 - t1,
    verifyTime: t4 - t3,
    txLatency,
    gas: gasUsed,
    txHash,
    blockNumber,
    success,
    gasPerByte
  };
}

// ---------- AVG ----------
function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ---------- SAVE CSV ----------
function saveCSVs(allTxResults) {
  // Save individual TX metrics
  let txCsv = "TX,ParcelId,Sign(ms),Verify(ms),TxLatency(ms),GasUsed,BlockNumber,Success,GasPerByte,TxHash\n";
  allTxResults.forEach((r, idx) => {
    txCsv += `${idx + 1},${r.parcelId},${r.signTime},${r.verifyTime},${r.txLatency},${r.gas},${r.blockNumber},${r.success},${r.gasPerByte.toFixed(2)},${r.txHash}\n`;
  });
  
  const metricsPath = path.resolve(__dirname, "metrics.csv");
  fs.writeFileSync(metricsPath, txCsv);
  console.log(`✅ Saved: ${metricsPath}`);

  // Save Block summary metrics
  let blockCsv = "Block,Size,Latency(ms),TPS,TotalGas,AvgGas,MinGas,MaxGas,AvgSign(ms),AvgVerify(ms),AvgTxLatency(ms),SuccessCount,FailCount\n";
  results.forEach(r => {
    blockCsv += `${r.block},${r.size},${r.latency},${r.tps.toFixed(2)},${r.totalGas},${r.avgGas.toFixed(2)},${r.minGas},${r.maxGas},${r.avgSign.toFixed(2)},${r.avgVerify.toFixed(2)},${r.avgTxLatency.toFixed(2)},${r.successCount},${r.failCount}\n`;
  });

  const blockMetricsPath = path.resolve(__dirname, "block_metrics.csv");
  fs.writeFileSync(blockMetricsPath, blockCsv);
  console.log(`✅ Saved: ${blockMetricsPath}`);
}

// ---------- RUN ----------
run().catch(err => {
  console.error("Fatal run error:", err);
  process.exit(1);
});