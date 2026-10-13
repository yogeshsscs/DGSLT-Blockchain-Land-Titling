const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
    quiet: true
});

async function main() {

    const { ethers } = hre;

    const CONTRACT_ADDRESS =
        process.env.CONTRACT_ADDRESS ||
        "YOURDEPLOYCONTRACTADDRESS";

    const USERS = process.env.BENCHMARK_USERS
        ? process.env.BENCHMARK_USERS.split(",").map(Number)
        : [1, 5, 10, 20, 50, 100, 200, 500];
    const TX_PER_USER = Number(process.env.TX_PER_USER) || 10;
    const RUN_BASE =
        (Number(process.env.BENCHMARK_RUN_ID) ||
            Math.floor(Date.now() / 1000)) * 1000000;

    const LandRegistry = await ethers.getContractFactory("DGSSLandRegistry");

    let contract;

    const code = await ethers.provider.getCode(CONTRACT_ADDRESS);

    if (code === "0x") {
        console.log(
            `No contract found at ${CONTRACT_ADDRESS}. Deploying DGSSLandRegistry for this benchmark run...`
        );

        contract = await LandRegistry.deploy();
        await contract.deployed();

        console.log(`Benchmark contract deployed at ${contract.address}`);
    } else {
        contract = LandRegistry.attach(CONTRACT_ADDRESS);
    }

    const signers = await ethers.getSigners();
    const signerLocks = signers.map(() => Promise.resolve());

    let results = [];

    console.log("\n===============================");
    console.log("CPU & Memory Benchmark Started");
    console.log("===============================\n");

    for (const userCount of USERS) {

        console.log(`Running Benchmark : ${userCount} Concurrent Users`);

        let totalGas = 0;
        let successTx = 0;

        const cpuStart = process.cpuUsage();

        const memStart = process.memoryUsage();

        const benchmarkStart = process.hrtime.bigint();

        let promises = [];

        for (let i = 0; i < userCount; i++) {

            const signer = signers[i % signers.length];

            const userContract = contract.connect(signer);

            for (let j = 0; j < TX_PER_USER; j++) {

                const parcelId =
                    RUN_BASE +
                    userCount * 100000 +
                    i * TX_PER_USER +
                    j;

                const signerIndex = i % signers.length;

                const task = signerLocks[signerIndex].then(async () => {

                    try {

                        const hash = ethers.utils.keccak256(
                            ethers.utils.toUtf8Bytes(
                                `Owner_${parcelId}-Residential-Bhopal-Madhya Pradesh`
                            )
                        );

                        const tx = await userContract.storeLand(

                            parcelId,

                            hash

                        );

                        const receipt = await tx.wait();

                        totalGas += Number(receipt.gasUsed);

                        successTx++;

                    } catch (err) {

                        console.log(
                            `Transaction Failed: ${err.reason || err.message}`
                        );

                    }

                });

                signerLocks[signerIndex] = task.catch(() => {});

                promises.push(task);

            }

        }

        await Promise.all(promises);

        const benchmarkEnd = process.hrtime.bigint();

        const cpuEnd = process.cpuUsage(cpuStart);

        const memEnd = process.memoryUsage();

        const totalTransactions = userCount * TX_PER_USER;

        const totalTimeMs = Number(benchmarkEnd - benchmarkStart) / 1e6;

        const avgLatency = totalTimeMs / totalTransactions;

        const tps = totalTransactions / (totalTimeMs / 1000);

        const avgGas = successTx > 0 ? totalGas / successTx : 0;

        results.push({

            users: userCount,

            transactions: totalTransactions,

            latency: avgLatency.toFixed(4),

            tps: tps.toFixed(2),

            gas: avgGas.toFixed(0),

            cpuUser: cpuEnd.user,

            cpuSystem: cpuEnd.system,

            heapUsed: (memEnd.heapUsed / 1024 / 1024).toFixed(2),

            heapTotal: (memEnd.heapTotal / 1024 / 1024).toFixed(2),

            rss: (memEnd.rss / 1024 / 1024).toFixed(2)

        });

        console.table(results.slice(-1));

    }

    //-----------------------------------------------------
    // Write CSV
    //-----------------------------------------------------

    let csv =
"Users,Transactions,Latency(ms),TPS,AverageGas,CPU_User(us),CPU_System(us),HeapUsed(MB),HeapTotal(MB),RSS(MB)\n";

    results.forEach(r => {

        csv +=

`${r.users},${r.transactions},${r.latency},${r.tps},${r.gas},${r.cpuUser},${r.cpuSystem},${r.heapUsed},${r.heapTotal},${r.rss}\n`;

    });

    fs.writeFileSync("cpu_memory_results.csv", csv);

    console.log("\nCSV Exported Successfully.");

    console.log("Benchmark Completed.");

}

main()

.then(() => process.exit(0))

.catch((error) => {

    console.error(error);

    process.exit(1);

});
