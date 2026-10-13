const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// =====================================================
// Configuration
// =====================================================

const ITERATIONS = 100;

const RESULTS_DIR = path.join(__dirname, "../results");

if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const CSV_FILE = path.join(RESULTS_DIR, "blockchain_results.csv");

// =====================================================
// Utility Functions
// =====================================================

function average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function minimum(arr) {
    if (arr.length === 0) return 0;
    return Math.min(...arr);
}

function maximum(arr) {
    if (arr.length === 0) return 0;
    return Math.max(...arr);
}

function stdDeviation(arr) {
    if (arr.length === 0) return 0;

    const avg = average(arr);

    const variance =
        arr.reduce((sum, value) => {
            return sum + Math.pow(value - avg, 2);
        }, 0) / arr.length;

    return Math.sqrt(variance);
}

// =====================================================
// CSV Writer
// =====================================================

function writeCSV(results) {

    const header =
        "Operation,Iterations,AvgGas,MinGas,MaxGas,StdGas,AvgLatency(ms),MinLatency(ms),MaxLatency(ms),StdLatency(ms),TPS,SuccessfulTx,FailedTx,SuccessRate(%)\n";

    let rows = "";

    results.forEach(r => {

        rows +=
`${r.operation},
${r.iterations},
${r.avgGas.toFixed(2)},
${r.minGas},
${r.maxGas},
${r.stdGas.toFixed(2)},
${r.avgLatency.toFixed(2)},
${r.minLatency.toFixed(2)},
${r.maxLatency.toFixed(2)},
${r.stdLatency.toFixed(2)},
${r.tps.toFixed(2)},
${r.success},
${r.failed},
${r.successRate.toFixed(2)}
`.replace(/\n/g, ",").replace(/,$/, "\n");

    });

    fs.writeFileSync(CSV_FILE, header + rows);

    console.log("\nCSV exported:");
    console.log(CSV_FILE);
}

// =====================================================
// Deploy Contract
// =====================================================

async function deployContract() {

    console.log("Deploying DGSSLandRegistry...\n");

    const LandRegistry =
        await ethers.getContractFactory("DGSSLandRegistry");

   const contract = await LandRegistry.deploy();

await contract.deployed();

console.log(
    "Contract:",
    contract.address
);

    return contract;

}

// =====================================================
// Statistics Collector
// =====================================================

function createCollector(name) {

    return {

        operation: name,

        gas: [],

        latency: [],

        success: 0,

        failed: 0

    };

}

// =====================================================
// Finalize Statistics
// =====================================================

function finalizeStats(stats, iterations) {

    const totalLatency =
        stats.latency.reduce((a, b) => a + b, 0);

    return {

        operation: stats.operation,

        iterations,

        avgGas: average(stats.gas),

        minGas: minimum(stats.gas),

        maxGas: maximum(stats.gas),

        stdGas: stdDeviation(stats.gas),

        avgLatency: average(stats.latency),

        minLatency: minimum(stats.latency),

        maxLatency: maximum(stats.latency),

        stdLatency: stdDeviation(stats.latency),

        tps:
            totalLatency > 0
                ? (stats.success * 1000) /
                  totalLatency
                : 0,

        success: stats.success,

        failed: stats.failed,

        successRate:
            (stats.success / iterations) * 100

    };

}

// =====================================================
// Benchmark Helpers
// =====================================================

async function measureTransaction(txPromise) {

    const start = process.hrtime.bigint();

    const tx = await txPromise;

    const receipt = await tx.wait();

    const end = process.hrtime.bigint();

    const latency =
        Number(end - start) / 1e6;

    return {

        gas:
            Number(receipt.gasUsed),

        latency

    };

}

console.log("\n");
console.log("==============================================");
console.log("DGSS Blockchain Benchmark");
console.log("==============================================");
console.log();

// =====================================================
// Benchmark : Land Registration
// =====================================================

async function benchmarkStoreLand(contract, signer) {

    console.log("Benchmarking Land Registration...\n");

    const stats = createCollector("Land Registration");

    for (let i = 1; i <= ITERATIONS; i++) {

        try {

            const result = await measureTransaction(

                contract
                    .connect(signer)
                    .storeLand(
                        i,
                        `LAND_HASH_${i}`
                    )

            );

            stats.gas.push(result.gas);
            stats.latency.push(result.latency);
            stats.success++;

            if (i % 10 === 0)
                console.log(`Registration ${i}/${ITERATIONS}`);

        }
        catch (err) {

            stats.failed++;

            console.log(
                `Registration Failed : ${i}`
            );

        }

    }

    return finalizeStats(stats, ITERATIONS);

}

// =====================================================
// Benchmark : Ownership Transfer
// =====================================================

async function benchmarkTransfer(contract, signers) {

    console.log("\nBenchmarking Ownership Transfer...\n");

    const stats = createCollector("Ownership Transfer");

    for (let i = 1; i <= ITERATIONS; i++) {

        try {

            const currentOwner =
                signers[(i - 1) % signers.length];

            const newOwner =
                signers[i % signers.length];

            const parcelId =
                100000 + i;

            await (
                await contract
                    .connect(currentOwner)
                    .storeLand(
                        parcelId,
                        `TRANSFER_HASH_${parcelId}`
                    )
            ).wait();

            const result =
                await measureTransaction(

                    contract
                        .connect(currentOwner)
                        .transferLand(
                            parcelId,
                            await newOwner.getAddress()
                        )

                );

            stats.gas.push(result.gas);

            stats.latency.push(result.latency);

            stats.success++;

            if (i % 10 === 0)
                console.log(`Transfer ${i}/${ITERATIONS}`);

        }
        catch (err) {

            stats.failed++;

            console.log(
                `Transfer Failed : ${i}`
            );

        }

    }

    return finalizeStats(stats, ITERATIONS);

}

// =====================================================
// Main (Part 2)
// =====================================================

async function runPart2() {

    const signers =
        await ethers.getSigners();

    const contract =
        await deployContract();

    console.log("\n");
    console.log("==============================");
    console.log("Running Blockchain Benchmarks");
    console.log("==============================");
    console.log();

    const registrationResults =
        await benchmarkStoreLand(
            contract,
            signers[0]
        );

    const transferResults =
        await benchmarkTransfer(
            contract,
            signers
        );

    return {

        contract,

        signers,

        registrationResults,

        transferResults

    };

}

// =====================================================
// Benchmark : Land Sale
// =====================================================

async function benchmarkSale(contract, signers) {

    console.log("\nBenchmarking Land Sale...\n");

    const stats = createCollector("Land Sale");

    for (let i = 1; i <= ITERATIONS; i++) {

        try {

            const seller =
                signers[i % signers.length];

            const buyer =
                signers[(i + 1) % signers.length];

            const parcelId =
                200000 + i;

            await (
                await contract
                    .connect(seller)
                    .storeLand(
                        parcelId,
                        `SALE_HASH_${parcelId}`
                    )
            ).wait();

            const result =
                await measureTransaction(

                    contract
                        .connect(seller)
                        .sellLand(
                            parcelId,
                            await buyer.getAddress()
                        )

                );

            stats.gas.push(result.gas);

            stats.latency.push(result.latency);

            stats.success++;

            if (i % 10 === 0)
                console.log(`Sale ${i}/${ITERATIONS}`);

        }
        catch (err) {

            stats.failed++;

            console.log(
                `Sale Failed : ${i}`
            );

        }

    }

    return finalizeStats(stats, ITERATIONS);

}

// =====================================================
// Print Results
// =====================================================

function printSummary(results) {

    console.log("\n");
    console.log("==============================================================");
    console.log("Blockchain Benchmark Summary");
    console.log("==============================================================");

    results.forEach(r => {

        console.log(`\n${r.operation}`);

        console.log("------------------------------------------");

        console.log(`Iterations        : ${r.iterations}`);
        console.log(`Average Gas       : ${r.avgGas.toFixed(2)}`);
        console.log(`Minimum Gas       : ${r.minGas}`);
        console.log(`Maximum Gas       : ${r.maxGas}`);
        console.log(`Gas Std Dev       : ${r.stdGas.toFixed(2)}`);

        console.log();

        console.log(`Average Latency   : ${r.avgLatency.toFixed(2)} ms`);
        console.log(`Minimum Latency   : ${r.minLatency.toFixed(2)} ms`);
        console.log(`Maximum Latency   : ${r.maxLatency.toFixed(2)} ms`);
        console.log(`Latency Std Dev   : ${r.stdLatency.toFixed(2)} ms`);

        console.log();

        console.log(`TPS               : ${r.tps.toFixed(2)}`);

        console.log();

        console.log(`Successful Tx     : ${r.success}`);
        console.log(`Failed Tx         : ${r.failed}`);
        console.log(`Success Rate      : ${r.successRate.toFixed(2)} %`);

    });

    console.log("\n==============================================================");
    console.log("Benchmark Completed Successfully");
    console.log("==============================================================");

}

// =====================================================
// Main
// =====================================================

async function main() {

    const {

        contract,

        signers,

        registrationResults,

        transferResults

    } = await runPart2();

    const saleResults =
        await benchmarkSale(
            contract,
            signers
        );

    const allResults = [

        registrationResults,

        transferResults,

        saleResults

    ];

    writeCSV(allResults);

    printSummary(allResults);

}

main()

.then(() => process.exit(0))

.catch((err) => {

    console.error(err);

    process.exit(1);

});
