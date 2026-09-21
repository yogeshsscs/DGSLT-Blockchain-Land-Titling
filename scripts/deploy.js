// scripts/deploy.js
const hre = require("hardhat");
const {keygen} = require("../backend/dgss")

async function main() {
  console.log("🚀 Deploying LandTitle smart contract...\n");
  const LandTitle = await hre.ethers.getContractFactory("DGSSLandRegistry");
  //const LandTitle = await hre.ethers.getContractFactory("LandTitle");
  g= keygen().g;
  p=keygen().p;
  q=keygen().q;
  const landTitle = await LandTitle.deploy();

  // For ethers v5 - use .deployed() instead of waitForDeployment()
  await landTitle.deployed();

  const contractAddress = landTitle.address;

  console.log("✅ LandTitle deployed successfully!");
  console.log(`📍 Contract Address: ${contractAddress}`);

  // Save to .env file
  const fs = require("fs");
  const path = require("path");

  const envFilePath = path.resolve(process.cwd(), ".env");

  let envContent = "";
  if (fs.existsSync(envFilePath)) {
    envContent = fs.readFileSync(envFilePath, "utf-8");
  }

  const addressRegex = /^CONTRACT_ADDRESS=.*$/m;

  if (addressRegex.test(envContent)) {
    envContent = envContent.replace(addressRegex, `CONTRACT_ADDRESS=${contractAddress}`);
    console.log("🔄 Updated CONTRACT_ADDRESS in .env");
  } else {
    envContent = envContent.trim() + `\n\n# Deployed LandTitle Contract\nCONTRACT_ADDRESS=${contractAddress}\n`;
    console.log("📝 Added CONTRACT_ADDRESS to .env");
  }

  fs.writeFileSync(envFilePath, envContent.trim() + "\n", "utf-8");

  console.log("\n🎉 Deployment completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });