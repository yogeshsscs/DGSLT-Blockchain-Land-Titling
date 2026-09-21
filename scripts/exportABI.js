const fs = require("fs");
const path = require("path");

async function main() {
    try {
        console.log("Exporting ABI...");

        // Path to Hardhat artifact
        const artifactPath = path.join(
            __dirname,
            "..",
            "artifacts",
            "contracts",
            "DGSSLandRegistry.sol",
            "DGSSLandRegistry.json"
        );

        // Read artifact
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

        const abi = artifact.abi;

        // Path to React frontend
        const outputPath = path.join(
            __dirname,
            "..",
            "frontend",
            "src",
            "services",
            "ABI.json"
        );

        // Ensure directory exists
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        // Write ABI file
        fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));

        console.log("✅ ABI exported successfully!");
        console.log("Saved to:", outputPath);

    } catch (err) {
        console.error("❌ Error exporting ABI:", err);
    }
}

main();