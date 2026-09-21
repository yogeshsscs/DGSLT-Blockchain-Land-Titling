const hre = require("hardhat");
const fs = require("fs");

const N_RUNS = 50; // per operation
const CSV_PATH = "benchmark_results.csv";

function nowMs() {
  return Date.now();
}

async function deployContract() {
  const Contract = await hre.ethers.getContractFactory("LandTitle"); // your contract
  const contract = await Contract.deploy();
  await contract.deployed();
  return contract;
}

async function measureTx(txPromise) {
  const t0 = nowMs();
  const tx = await txPromise;
  const receipt = await tx.wait();
  const t1 = nowMs();

  return {
    gas: receipt.gasUsed.toNumber(),
    latencyMs: t1 - t0,
    blockNumber: receipt.blockNumber,
  };
}

async function run() {
  const [deployer, userA, userB] = await hre.ethers.getSigners();

  // fresh deploy for consistent state
  const contract = await deployContract();

  const rows = [];
  rows.push("operation,run,gas,latency_ms,block");

  // --- Operation 1: Registration ---
  for (let i = 0; i < N_RUNS; i++) {
    const parcelId = `P-${i}`;
    const txP = contract.connect(userA).registerParcel(parcelId, "LOC-A", "META");
    const m = await measureTx(txP);
    rows.push(`register,${i},${m.gas},${m.latencyMs},${m.blockNumber}`);
  }

  // --- Operation 2: Transfer ---
  for (let i = 0; i < N_RUNS; i++) {
    const parcelId = `T-${i}`;
    await contract.connect(userA).registerLand(parcelId, "LOC-B", "META");
    const txP = contract.connect(userA).transferLand(parcelId, userB.address);
    const m = await measureTx(txP);
    rows.push(`transfer,${i},${m.gas},${m.latencyMs},${m.blockNumber}`);
  }

  // --- Operation 3: Verification (view may not consume gas on call) ---
  // Force a state-changing verify if needed; else measure call latency only.
  for (let i = 0; i < N_RUNS; i++) {
    const parcelId = `V-${i}`;
    await contract.connect(userA).registerLand(parcelId, "LOC-C", "META");

    const t0 = nowMs();
    await contract.connect(userA).verifyOwnership(parcelId); // view or non-view
    const t1 = nowMs();

    rows.push(`verify,${i},0,${t1 - t0},NA`);
  }

  fs.writeFileSync(CSV_PATH, rows.join("\n"));
  console.log(`Saved results to ${CSV_PATH}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});