const hre = require("hardhat");
const fs = require("fs");

async function main() {

    const { ethers } = hre;

    //-------------------------------------------------------
    // Configuration
    //-------------------------------------------------------

    const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

    // Number of records to register
    const DATASET = [100, 500, 1000, 5000, 10000];

    //-------------------------------------------------------

    const Factory = await ethers.getContractFactory("DGSSLandRegistry");
    const contract = Factory.attach(CONTRACT_ADDRESS);

    let csv =
"Records,AverageGas,AverageLatency(ms),TPS,EstimatedStorage(Bytes),EstimatedStorage(KB)\n";

    console.log("\n====================================");
    console.log(" Storage Growth Benchmark");
    console.log("====================================\n");

    for (const totalRecords of DATASET) {

        console.log(`Registering ${totalRecords} land records...`);

        let totalGas = 0;
        let totalLatency = 0;

        const benchmarkStart = process.hrtime.bigint();

        for (let i = 1; i <= totalRecords; i++) {

            const parcelId = Date.now() + i;

            const start = process.hrtime.bigint();

            const tx = await contract.storeLand(
                parcelId,
                `HASH_${parcelId}`
            );

            const receipt = await tx.wait();

            const end = process.hrtime.bigint();

            totalLatency += Number(end - start) / 1e6;
            totalGas += Number(receipt.gasUsed);
        }

        const benchmarkEnd = process.hrtime.bigint();

        //----------------------------------------------------

        const avgLatency =
            totalLatency / totalRecords;

        const avgGas =
            totalGas / totalRecords;

        const totalTime =
            Number(
                benchmarkEnd -
                benchmarkStart
            ) / 1e6;

        const tps =
            totalRecords /
            (totalTime / 1000);

        //----------------------------------------------------
        // Estimated Storage
        //----------------------------------------------------
        // Land struct:
        // owner (20 bytes)
        // hash (32 bytes estimated)
        // timestamp (32 bytes)
        // exists (1 byte)
        // Solidity slot alignment ≈ 96 bytes

        const BYTES_PER_RECORD = 96;

        const estimatedStorage =
            totalRecords * BYTES_PER_RECORD;

        const storageKB =
            estimatedStorage / 1024;

        console.table([{

            Records: totalRecords,

            AvgGas:
                avgGas.toFixed(0),

            AvgLatency:
                avgLatency.toFixed(3),

            TPS:
                tps.toFixed(2),

            StorageBytes:
                estimatedStorage,

            StorageKB:
                storageKB.toFixed(2)

        }]);

        csv +=

`${totalRecords},${avgGas.toFixed(0)},${avgLatency.toFixed(4)},${tps.toFixed(2)},${estimatedStorage},${storageKB.toFixed(2)}\n`;

    }

    fs.writeFileSync(
        "storage_results.csv",
        csv
    );

    console.log("\nstorage_results.csv generated successfully.");

}

main()

.then(() => process.exit(0))

.catch((err) => {

    console.error(err);

    process.exit(1);

});