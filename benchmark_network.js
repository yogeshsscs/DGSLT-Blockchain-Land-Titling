const hre = require("hardhat");
const fs = require("fs");

async function main() {

    const { ethers } = hre;

    //----------------------------------------------------
    // Configuration
    //----------------------------------------------------

    const CONTRACT_ADDRESS = "YOURDEPLOYEDCONTRACTADDRESS";

    const USERS = [1, 5, 10, 20, 50, 100];

    const TX_PER_USER = 10;

    //----------------------------------------------------

    const Factory = await ethers.getContractFactory("DGSSLandRegistry");

    const contract = Factory.attach(CONTRACT_ADDRESS);

    const accounts = await ethers.getSigners();

    let csv =
"Users,Transactions,Latency(ms),TPS,AverageGas,QueueDelay(ms),Confirmation(ms),SuccessfulTx,FailedTx\n";

    console.log("\n======================================");
    console.log(" Network Performance Benchmark");
    console.log("======================================\n");

    for (const userCount of USERS) {

        console.log(`Testing ${userCount} concurrent users`);

        let success = 0;
        let failed = 0;

        let totalLatency = 0;
        let totalConfirmation = 0;
        let totalQueue = 0;
        let totalGas = 0;

        const benchmarkStart = process.hrtime.bigint();

        const promises = [];

        for (let u = 0; u < userCount; u++) {

            const signer = accounts[u % accounts.length];

            const registry = contract.connect(signer);

            for (let t = 0; t < TX_PER_USER; t++) {

                const parcelId =
                    Date.now() +
                    u * 10000 +
                    t;

                promises.push(

                    (async () => {

                        try {

                            //------------------------------------
                            // Queue start
                            //------------------------------------

                            const queueStart =
                                process.hrtime.bigint();

                            //------------------------------------
                            // Submit transaction
                            //------------------------------------

                            const tx =
                                await registry.storeLand(
                                    parcelId,
                                    `HASH_${parcelId}`
                                );

                            //------------------------------------
                            // Transaction accepted
                            //------------------------------------

                            const queueEnd =
                                process.hrtime.bigint();

                            //------------------------------------
                            // Wait for mining
                            //------------------------------------

                            const confirmationStart =
                                process.hrtime.bigint();

                            const receipt =
                                await tx.wait();

                            const confirmationEnd =
                                process.hrtime.bigint();

                            //------------------------------------

                            const queueDelay =
                                Number(queueEnd - queueStart) / 1e6;

                            const confirmation =
                                Number(
                                    confirmationEnd -
                                    confirmationStart
                                ) / 1e6;

                            const latency =
                                queueDelay +
                                confirmation;

                            totalQueue += queueDelay;

                            totalConfirmation +=
                                confirmation;

                            totalLatency +=
                                latency;

                            totalGas +=
                                Number(receipt.gasUsed);

                            success++;

                        }
                        catch (err) {

                            failed++;

                        }

                    })()

                );

            }

        }

        await Promise.all(promises);

        const benchmarkEnd =
            process.hrtime.bigint();

        const totalTransactions =
            userCount * TX_PER_USER;

        const benchmarkTime =
            Number(
                benchmarkEnd -
                benchmarkStart
            ) / 1e6;

        const avgLatency =
            totalLatency / success;

        const avgQueue =
            totalQueue / success;

        const avgConfirmation =
            totalConfirmation / success;

        const avgGas =
            totalGas / success;

        const tps =
            success /
            (benchmarkTime / 1000);

        console.table([{

            Users: userCount,

            Transactions: totalTransactions,

            Latency_ms:
                avgLatency.toFixed(3),

            TPS:
                tps.toFixed(2),

            Gas:
                avgGas.toFixed(0),

            Queue_ms:
                avgQueue.toFixed(3),

            Confirmation_ms:
                avgConfirmation.toFixed(3),

            Success: success,

            Failed: failed

        }]);

        csv +=

`${userCount},${totalTransactions},${avgLatency.toFixed(4)},${tps.toFixed(2)},${avgGas.toFixed(0)},${avgQueue.toFixed(4)},${avgConfirmation.toFixed(4)},${success},${failed}\n`;

    }

    fs.writeFileSync(
        "network_results.csv",
        csv
    );

    console.log("\nnetwork_results.csv generated.");

}

main()

.then(() => process.exit(0))

.catch((err) => {

    console.error(err);

    process.exit(1);

});
