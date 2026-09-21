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

// ======================================================
// HARDCODED HARDHAT KEYS
// ======================================================

// const PRIVATE_KEYS = [

// "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
// "0x59c6995e998f97a5a0044966f094538e4c3b7f3e7d8e8d4b8e0b2c7d2f8f9c71",
// "0x5de4111afe5f9408b9c1fc7d2f94f0a5d4f97f2d9c84c0a2d5f5d7e5f9d3c4a8",
// "0x7c8521182946e51e653712f8f4f8a0b7b7a9d0f4e2e6f9d8a7c5b4d3e2f1a0b1",
// "0x47e179ec1974887d1f4e0d8f1f3b5f7a2d6c1e8f5b3d7a1c9e4f2b6d8a3c1e7",
// "0x8b3a350cf5c34c9194ca3a545d0f7f8b7a9d1e2c3f4b5a6d7e8f9c0a1b2c3d4",
// "0x92db14e4036a7ce6f5c8d2a3b1e4f7a9d0c3b6e8f2a4d7c9e1f5b8a0c2d4e6",
// "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f1b5b9f3b0d5f6e7a8",
// "0x6cbed15c793ce576f6d1e0d7f2a9c3b5e8f4d1a7c2b9e5d3f6a8c1e4b7d9f2",
// "0x6370fd033cbeecf7f0f3e5a1d4c7b9e2a6f8d1c3b5e7a9d2f4c6b8e1a3d5f7",
// "0x646f1ce2a7f4e8b3d9c5a1f7e2d6b4c8a3f9d1e5b7c2a6f4d8e3c1b5a7d9f2",
// "0xadd53f9a7e588dcb8f0d7e4c2a1b5f9d3c6e8a2f4b7d1c5e9a3f6d8b2c4e7"
// ];

// // ======================================================
// // USERS
// // ======================================================

// const users = PRIVATE_KEYS.map(pk =>
//   new ethers.Wallet(pk, provider)
// );

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