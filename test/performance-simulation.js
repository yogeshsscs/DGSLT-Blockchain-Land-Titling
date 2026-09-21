// const { ethers } = require("hardhat");
// const fs = require("fs");

// async function simulatePerformance() {
//   const [owner, user1, user2] = await ethers.getSigners();
//   const LandTitle = await ethers.getContractFactory("LandTitle");
//   const contract = await LandTitle.deploy();
//   //await contract.waitForDeployment();

//   const startTime = Date.now();
//   let totalGas = 0;
//   let txCount = 0;

//   // Simulate 1000 transactions
//   for (let i = 1; i <= 10; i++) {
//     const tx = await contract.connect(owner).registerParcel(i, `geospatial_data_for_parcel_${i}`);
//     const receipt = await tx.wait();
//     console.log(receipt.gasUsed)
//     totalGas += receipt.gasUsed;
//     txCount++;

//     if (i % 100 === 0) {
//       console.log(`Processed ${i} transactions...`);
//     }
//   }

//   const endTime = Date.now();
//   const durationSeconds = (endTime - startTime) / 10;

//   // Simulated metrics (matching Table 1)
//   const results = {
//     processingTimeDays: (durationSeconds / 86400).toFixed(1),
//     disputeRate: "2.0",
//     costPerTxUSD: "50",
//     securityScore: "95",
//     throughputTxPerSec: (txCount / durationSeconds).toFixed(0),
//     energyKWhPerTx: "0.002",
//   };

//   console.log("\n=== Performance Results ===");
//   console.table(results);

//   // Save to JSON for LaTeX table generation
//   fs.writeFileSync("./performance-results.json", JSON.stringify(results, null, 2));
// }

// simulatePerformance();

// test/performance-simulation.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Land Title Registry Performance Simulation...\n");
  const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  const [deployer] = await ethers.getSigners();
  const LandTitle = await ethers.getContractFactory("LandTitle");
  const landTitle = await LandTitle.deploy();
  await landTitle.deployed();

  console.log(`Contract deployed at: ${landTitle.address}\n`);

  const startTime = Date.now();
  const totalTransactions = 100;        // Change this number as needed
  let successfulTx = 0;
  let failedTx = 0;
  const gasUsedList = [];

  console.log(`Running ${totalTransactions} transactions...\n`);

  for (let i = 1; i <= totalTransactions; i++) {
    try {
      const parcelId = 1000 + i;
      const geospatialHash = `ipfs://QmHashForParcel${parcelId}`;
      console.log(`Registering Parcel ID: ${parcelId} with geospatial hash: ${geospatialHash}`);

      // Register Parcel
      const tx = await landTitle.registerParcel(parcelId, geospatialHash);
      const receipt = await tx.wait();

      gasUsedList.push(receipt.gasUsed.toNumber());
      successfulTx++;

      // Optional: Transfer ownership for every 3rd parcel (to simulate real usage)
      if (i % 4 === 0) {
        const randomAddress = ethers.Wallet.createRandom().address;
        const transferTx = await landTitle.transferOwnership(parcelId, randomAddress);
        await transferTx.wait();
      }

      // Progress indicator
      if (i % 100 === 0) {
        console.log(`Progress: ${i}/${totalTransactions} transactions completed`);
      }

    } catch (error) {
      failedTx++;
      console.log(`❌ Transaction ${i} failed: ${error.message}`);
    }
  }

  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;
  const totalGasUsed = gasUsedList.reduce((a, b) => a + b, 0);
  const avgGasPerTx = totalGasUsed / successfulTx || 0;

  // Realistic Calculations
  const results = {

    totalTransactions: totalTransactions,
    successfulTransactions: successfulTx,
    failedTransactions: failedTx,
    successRate: ((successfulTx / totalTransactions) * 100).toFixed(2) + "%",
    
    // Performance Metrics
    durationSeconds: durationSeconds.toFixed(2),
    processingTimeDays: (durationSeconds / 86400),//.toFixed(4),
    throughputTxPerSec: (successfulTx / durationSeconds).toFixed(2),
    
    // Cost & Efficiency
    avgGasPerTx: avgGasPerTx.toFixed(0),
    //estimatedCostPerTx: (avgGasPerTx * 0.000000025).toFixed(4), // Assuming ~25 gwei & ETH price
    
    // Dispute & Security
    disputeRate: ((failedTx / totalTransactions) * 100).toFixed(2) + "%",
    //securityScore: Math.min(98, Math.round(75 + (successfulTx / totalTransactions) * 25)),
    
    // Energy (simulated - PoA is very efficient)
    //energyKWhPerTx: "0.0008"
  };

  console.log("\n" + "=".repeat(60));
  console.log("📊 PERFORMANCE SIMULATION RESULTS");
  console.log("Provider: Local Hardhat Node:",provider.connection.url);
  console.log('deployer address:', deployer.address);
  console.log("=".repeat(60));
  console.table(results);

  // Save results to file
  const reportPath = path.join(__dirname, "performance-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log(`\n✅ Report saved to: test/performance-report.json`);
  console.log(`Total Duration: ${durationSeconds.toFixed(2)} seconds`);
  console.log(`Throughput: ${results.throughputTxPerSec} tx/sec`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Simulation failed:", error);
    process.exit(1);
  });