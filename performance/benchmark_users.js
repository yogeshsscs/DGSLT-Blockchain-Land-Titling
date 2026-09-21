// benchmark_users.js

const { ethers } = require("ethers");
const dgss = require("../dgss");
const fs = require("fs");
const { performance } = require("perf_hooks");

// ======================================================
// CONFIGURATION
// ======================================================

const RPC_URL = "http://127.0.0.1:8545";

const CONTRACT_ADDRESS =
    "0x5fbdb2315678afecb367f032d93f642f64180aa3";

const USER_COUNTS = [1, 5, 10, 15, 20];

const TX_PER_USER = 10;

// ======================================================
// PROVIDER
// ======================================================

const provider =
    new ethers.providers.JsonRpcProvider(RPC_URL);

// ======================================================
// ABI
// ======================================================

const abi = [

    "function storeLand(uint256,string) returns(uint256,string)",

    "function getLand(uint256) view returns(address,string,uint256)",

    "function sellLand(uint256,address)",

    "function transferLand(uint256,address)"

];

const users = [];

async function loadUsers() {

    const accounts =
        await provider.listAccounts();

    for (const addr of accounts) {

        const signer =
            provider.getSigner(addr);

        users.push(signer);
    }

}
// ======================================================
// HELPERS
// ======================================================

function avg(arr) {

    return arr.reduce((a, b) => a + b, 0) /
        arr.length;

}

function saveCSV(filename, rows) {

    fs.writeFileSync(
        filename,
        rows.join("\n")
    );

    console.log(`✅ Saved ${filename}`);

}

// ======================================================
// DGSS SETUP
// ======================================================

function setupDGSS() {

    const user = dgss.keygen();

    const a1 = dgss.keygen(user.params);
    const a2 = dgss.keygen(user.params);
    const a3 = dgss.keygen(user.params);

    const shares = [

        dgss.rmIssue(
            user.y,
            a1.x,
            user.params
        ),

        dgss.rmIssue(
            user.y,
            a2.x,
            user.params
        ),

        dgss.rmIssue(
            user.y,
            a3.x,
            user.params
        )

    ];

    const cert =
        dgss.aggregateCert(
            shares,
            user.params
        );

    const am =
        dgss.keygen(user.params);

    return {
        user,
        cert,
        am,
        authorities: [a1, a2, a3]
    };
}

// ======================================================
// RUN USER TEST
// ======================================================

async function benchmarkUsers(userCount) {

    console.log(
        `\n🚀 Testing ${userCount} Users`
    );

    const activeUsers =
        users.slice(0, userCount);

    let totalGas = [];
    let signTimes = [];
    let verifyTimes = [];

    const start =
        performance.now();

    const promises = [];

    for (let u = 0; u < activeUsers.length; u++) {

        const wallet =
            activeUsers[u];

        const contract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                abi,
                wallet
            );

        const dgssData =
            setupDGSS();

        for (let i = 0; i < TX_PER_USER; i++) {

            promises.push(

                (async () => {

                    //   const parcelId =
                    //     Number(
                    //       `${userCount}${u}${i}${Date.now()}`
                    //     );

                    const parcelId =
                        Date.now() % 100000000 +
                        (u * 1000) +
                        i;
                    const hash =
                        ethers.utils.keccak256(
                            ethers.utils.toUtf8Bytes(
                                `LAND-${parcelId}`
                            )
                        );

                    // DGSS SIGN

                    let t1 =
                        performance.now();

                    const sig =
                        dgss.sign(
                            dgssData.user,
                            dgssData.cert,
                            dgssData.am.y,
                            hash,
                            {},
                            dgssData.user.params
                        );

                    let t2 =
                        performance.now();

                    signTimes.push(
                        t2 - t1
                    );

                    // DGSS VERIFY

                    t1 =
                        performance.now();

                    dgss.verify(
                        sig,
                        dgssData.am.x,
                        dgssData.authorities.map(
                            a => a.y
                        ),
                        hash,
                        dgssData.user.params
                    );

                    t2 =
                        performance.now();

                    verifyTimes.push(
                        t2 - t1
                    );

                    const tx =
                        await contract.storeLand(
                            parcelId,
                            hash
                        );

                    const receipt =
                        await tx.wait();

                    totalGas.push(
                        receipt.gasUsed.toNumber()
                    );

                })()

            );

        }

    }

    await Promise.all(promises);

    const end =
        performance.now();

    const totalTx =
        userCount * TX_PER_USER;

    const totalTime =
        end - start;

    const latency =
        totalTime / totalTx;

    const tps =
        totalTx /
        (totalTime / 1000);

    return {

        users: userCount,

        transactions: totalTx,

        latency,

        tps,

        avgGas:
            avg(totalGas),

        signTime:
            avg(signTimes),

        verifyTime:
            avg(verifyTimes)

    };

}

// ======================================================
// MAIN
// ======================================================

async function main() {
    await loadUsers();
    const scalabilityResults = [];

    for (const count of USER_COUNTS) {

        const result =
            await benchmarkUsers(count);

        scalabilityResults.push(result);

    }

    console.table(scalabilityResults);

    // =====================================
    // MAIN CSV
    // =====================================

    const rows = [

        "Users,Transactions,Latency(ms),TPS,AvgGas,Sign(ms),Verify(ms)"

    ];

    scalabilityResults.forEach(r => {

        rows.push(

            `${r.users},${r.transactions},${r.latency},${r.tps},${r.avgGas},${r.signTime},${r.verifyTime}`

        );

    });

    saveCSV(
        "user_scalability.csv",
        rows
    );

    // =====================================
    // LATENCY CSV
    // =====================================

    const latencyRows = [

        "Users,Latency"

    ];

    scalabilityResults.forEach(r => {

        latencyRows.push(
            `${r.users},${r.latency}`
        );

    });

    saveCSV(
        "latency_results.csv",
        latencyRows
    );

    // =====================================
    // TPS CSV
    // =====================================

    const tpsRows = [

        "Users,TPS"

    ];

    scalabilityResults.forEach(r => {

        tpsRows.push(
            `${r.users},${r.tps}`
        );

    });

    saveCSV(
        "throughput_results.csv",
        tpsRows
    );

    // =====================================
    // DGSS CSV
    // =====================================

    const dgssRows = [

        "Users,Sign,Verify"

    ];

    scalabilityResults.forEach(r => {

        dgssRows.push(
            `${r.users},${r.signTime},${r.verifyTime}`
        );

    });

    saveCSV(
        "dgss_user_results.csv",
        dgssRows
    );

    console.log(
        "\n🎉 Benchmark Completed"
    );

}

main().catch(console.error);
