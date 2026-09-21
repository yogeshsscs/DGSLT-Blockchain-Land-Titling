const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
  quiet: true
});

// =====================================================
// CONFIGURATION
// =====================================================

const RPC_URL = "http://127.0.0.1:8545";

const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS;

if (!CONTRACT_ADDRESS) {
  throw new Error(
    "CONTRACT_ADDRESS is missing. Deploy the contract first with: npm run deploy-all"
  );
}

const provider =
  new ethers.providers.JsonRpcProvider(
    RPC_URL
  );

// =====================================================
// ABI
// =====================================================

const abi = [

  "function storeLand(uint256,string) returns(uint256,string)",

  "function sellLand(uint256,address)",

  "function transferLand(uint256,address)",

  "function getLand(uint256) view returns(address,string,uint256)",

  "function getOwnershipHistoryCount(uint256) view returns(uint256)",

  "function getOwnershipHistoryRecord(uint256,uint256) view returns(address,address,uint256,string)"
];

// =====================================================
// ACCOUNTS
// =====================================================

const PRIVATE_KEYS = [

  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",

  "0x59c6995e998f97a5a0044966f094538e4c3b7f3e7d8e8d4b8e0b2c7d2f8f9c71",

  "0x5de4111afe5f9408b9c1fc7d2f94f0a5d4f97f2d9c84c0a2d5f5d7e5f9d3c4a8"

];

const owner =
  new ethers.Wallet(
    PRIVATE_KEYS[0],
    provider
  );

const buyer =
  new ethers.Wallet(
    PRIVATE_KEYS[1],
    provider
  );

const newOwner =
  new ethers.Wallet(
    PRIVATE_KEYS[2],
    provider
  );

const contract =
  new ethers.Contract(
    CONTRACT_ADDRESS,
    abi,
    owner
  );

// =====================================================
// PARAMETERS
// =====================================================

const ITERATIONS = 100;
const RUN_ID =
  Number(process.env.BENCHMARK_RUN_ID) ||
  Math.floor(Date.now() / 1000);
const PARCEL_BASE =
  RUN_ID * 1000;

// =====================================================
// HELPERS
// =====================================================

function avg(arr) {

  return (
    arr.reduce((a, b) => a + b, 0) /
    arr.length
  );

}

function saveCSV(results) {

  let csv =
    "Operation,Iteration,Latency(ms),Gas,TPS\n";

  results.forEach(r => {

    csv +=
      `${r.operation},${r.iteration},${r.latency},${r.gas},${r.tps}\n`;

  });

  fs.writeFileSync(
    "land_operations_results.csv",
    csv
  );

  console.log(
    "✅ land_operations_results.csv saved"
  );
}

// =====================================================
// STORE LAND
// =====================================================

async function benchmarkStoreLand() {

  console.log(
    "\n===== STORE LAND BENCHMARK ====="
  );

  let results = [];

  for (let i = 0; i < ITERATIONS; i++) {

    const parcelId =
      PARCEL_BASE + i;

    const hash =
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          `LAND-${parcelId}`
        )
      );

    const start =
      performance.now();

    const tx =
      await contract.storeLand(
        parcelId,
        hash
      );

    const receipt =
      await tx.wait();

    const end =
      performance.now();

    const latency =
      end - start;

    const tps =
      1000 / latency;

    results.push({

      operation: "STORE",

      iteration: i + 1,

      latency,

      gas:
        receipt.gasUsed.toNumber(),

      tps

    });

  }

  return results;
}

// =====================================================
// SELL LAND
// =====================================================

async function benchmarkSellLand() {

  console.log(
    "\n===== SELL LAND BENCHMARK ====="
  );

  let results = [];

  for (let i = 0; i < ITERATIONS; i++) {

    const parcelId =
      PARCEL_BASE + 100000 + i;

    const hash =
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          `SALE-${parcelId}`
        )
      );

    await (
      await contract.storeLand(
        parcelId,
        hash
      )
    ).wait();

    const start =
      performance.now();

    const tx =
      await contract.sellLand(
        parcelId,
        buyer.address
      );

    const receipt =
      await tx.wait();

    const end =
      performance.now();

    const latency =
      end - start;

    const tps =
      1000 / latency;

    results.push({

      operation: "SELL",

      iteration: i + 1,

      latency,

      gas:
        receipt.gasUsed.toNumber(),

      tps

    });

  }

  return results;
}

// =====================================================
// TRANSFER LAND
// =====================================================

async function benchmarkTransferLand() {

  console.log(
    "\n===== TRANSFER LAND BENCHMARK ====="
  );

  let results = [];

  for (let i = 0; i < ITERATIONS; i++) {

    const parcelId =
      PARCEL_BASE + 200000 + i;

    const hash =
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          `TRANSFER-${parcelId}`
        )
      );

    await (
      await contract.storeLand(
        parcelId,
        hash
      )
    ).wait();

    const start =
      performance.now();

    const tx =
      await contract.transferLand(
        parcelId,
        newOwner.address
      );

    const receipt =
      await tx.wait();

    const end =
      performance.now();

    const latency =
      end - start;

    const tps =
      1000 / latency;

    results.push({

      operation: "TRANSFER",

      iteration: i + 1,

      latency,

      gas:
        receipt.gasUsed.toNumber(),

      tps

    });

  }

  return results;
}

// =====================================================
// SUMMARY
// =====================================================

function printSummary(allResults) {

  const store =
    allResults.filter(
      x => x.operation === "STORE"
    );

  const sell =
    allResults.filter(
      x => x.operation === "SELL"
    );

  const transfer =
    allResults.filter(
      x => x.operation === "TRANSFER"
    );

  console.log("\n=========================");
  console.log("SUMMARY");
  console.log("=========================");

  console.table({

    StoreLand: {

      AvgGas:
        avg(
          store.map(x => x.gas)
        ).toFixed(2),

      AvgLatency:
        avg(
          store.map(
            x => x.latency
          )
        ).toFixed(2),

      AvgTPS:
        avg(
          store.map(
            x => x.tps
          )
        ).toFixed(2)

    },

    SellLand: {

      AvgGas:
        avg(
          sell.map(x => x.gas)
        ).toFixed(2),

      AvgLatency:
        avg(
          sell.map(
            x => x.latency
          )
        ).toFixed(2),

      AvgTPS:
        avg(
          sell.map(
            x => x.tps
          )
        ).toFixed(2)

    },

    TransferLand: {

      AvgGas:
        avg(
          transfer.map(
            x => x.gas
          )
        ).toFixed(2),

      AvgLatency:
        avg(
          transfer.map(
            x => x.latency
          )
        ).toFixed(2),

      AvgTPS:
        avg(
          transfer.map(
            x => x.tps
          )
        ).toFixed(2)

    }

  });

}

// =====================================================
// RUN
// =====================================================

async function main() {

  const network =
    await provider.getNetwork();

  const code =
    await provider.getCode(CONTRACT_ADDRESS);

  if (code === "0x") {
    throw new Error(
      `No contract found at ${CONTRACT_ADDRESS} on chain ${network.chainId}. Start your Hardhat node and deploy with: npm run deploy-all`
    );
  }

  let allResults = [];

  const storeResults =
    await benchmarkStoreLand();

  const sellResults =
    await benchmarkSellLand();

  const transferResults =
    await benchmarkTransferLand();

  allResults.push(
    ...storeResults,
    ...sellResults,
    ...transferResults
  );

  saveCSV(allResults);

  printSummary(allResults);

  console.log(
    "\n✅ Benchmark Complete"
  );

}

main().catch(error => {
  const reason =
    error.reason ||
    error.error?.reason ||
    error.message ||
    error;

  console.error("\nBenchmark failed:", reason);
  process.exitCode = 1;
});
