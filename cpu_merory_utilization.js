// const { ethers } = require("hardhat");
// const { createObjectCsvWriter } = require("csv-writer");
// // benchmark_cpu_memory.js (CPU and memory utilization)
// // benchmark_scalability.js (1–500 concurrent users)
// // benchmark_concurrency.js (parallel transaction execution)
// // benchmark_storage.js (storage growth)
// // benchmark_confirmation.js (block confirmation time)
// // benchmark_queue.js (transaction queue behavior)
// const USERS = [1, 5, 10, 20, 50, 100, 200, 500];
// const TX_PER_USER = 10;

// async function main() {

//     const provider = ethers.provider;

//     const accounts = await ethers.getSigners();

//     const contractAddress = "YOUR_CONTRACT_ADDRESS";

//     const LandRegistry = await ethers.getContractFactory("LandRegistry");

//     const contract = LandRegistry.attach(contractAddress);

//     const csvWriter = createObjectCsvWriter({
//         path: "cpu_memory_results.csv",
//         header: [
//             {id:'users',title:'Users'},
//             {id:'transactions',title:'Transactions'},
//             {id:'latency',title:'Latency(ms)'},
//             {id:'tps',title:'TPS'},
//             {id:'gas',title:'AverageGas'},
//             {id:'cpuUser',title:'CPU_User(us)'},
//             {id:'cpuSystem',title:'CPU_System(us)'},
//             {id:'heapUsed',title:'HeapUsed(MB)'},
//             {id:'heapTotal',title:'HeapTotal(MB)'},
//             {id:'rss',title:'RSS(MB)'}
//         ]
//     });

//     let results = [];

//     for(const userCount of USERS){

//         console.log(`\nTesting ${userCount} Users`);

//         let totalLatency=0;
//         let totalGas=0;

//         const cpuStart = process.cpuUsage();

//         const memStart = process.memoryUsage();

//         const startTime = process.hrtime.bigint();

//         let promises=[];

//         for(let u=0;u<userCount;u++){

//             const signer=accounts[u%accounts.length];

//             const userContract=contract.connect(signer);

//             for(let t=0;t<TX_PER_USER;t++){

//                 const parcelId =
//                     userCount*1000000+
//                     u*10000+
//                     t;

//                 promises.push(

//                     (async()=>{

//                         const tx =
//                         await userContract.storeLand(
//                             parcelId,
//                             `Owner${u}`,
//                             "Residential",
//                             "Bhopal",
//                             "MP"
//                         );

//                         const receipt =
//                         await tx.wait();

//                         totalGas+=receipt.gasUsed.toNumber();

//                     })()

//                 );

//             }

//         }

//         await Promise.all(promises);

//         const endTime=process.hrtime.bigint();

//         const cpuEnd=process.cpuUsage(cpuStart);

//         const memEnd=process.memoryUsage();

//         const totalTransactions=userCount*TX_PER_USER;

//         totalLatency=
//         Number(endTime-startTime)/1e6;

//         const avgLatency=
//         totalLatency/totalTransactions;

//         const tps=
//         totalTransactions/
//         (totalLatency/1000);

//         const avgGas=
//         totalGas/totalTransactions;

//         results.push({

//             users:userCount,

//             transactions:totalTransactions,

//             latency:avgLatency.toFixed(4),

//             tps:tps.toFixed(2),

//             gas:avgGas.toFixed(2),

//             cpuUser:cpuEnd.user,

//             cpuSystem:cpuEnd.system,

//             heapUsed:
//             (memEnd.heapUsed/1024/1024).toFixed(2),

//             heapTotal:
//             (memEnd.heapTotal/1024/1024).toFixed(2),

//             rss:
//             (memEnd.rss/1024/1024).toFixed(2)

//         });

//         console.table(results.slice(-1));

//     }

//     await csvWriter.writeRecords(results);

//     console.log("\nCPU & Memory Benchmark Completed");

// }

// main()
// .then(()=>process.exit(0))
// .catch((error)=>{
//     console.error(error);
//     process.exit(1);
// });

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
        "0x5fbdb2315678afecb367f032d93f642f64180aa3";

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
