// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy the contract — replace "LandRegistry" with your contract name
  const LandRegistry = await ethers.getContractFactory("LandRegistry");
  const landRegistry = await LandRegistry.deploy();

  await landRegistry.waitForDeployment();

  const address = await landRegistry.getAddress();
  console.log("LandRegistry deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
// import pkg from "hardhat";
// const { ethers } = pkg;

// async function main() {
//   console.log("Starting deployment...");

//   // Check if ethers is defined
//   if (!ethers) {
//     throw new Error("Hardhat Ethers plugin not found. Check your config.");
//   }

//   const LandTitle = await ethers.getContractFactory("LandTitle");
//   const landTitle = await LandTitle.deploy();

//   await landTitle.waitForDeployment();

//   const address = await landTitle.getAddress();
//   console.log("✅ LandTitle deployed to:", address);
// }

// main().catch((error) => {
//   console.error("Deployment failed:");
//   console.error(error);
//   process.exit(1);
// });


// scripts/deploy.cjs
// const hre = require("hardhat");

// async function main() {
//   const LandTitle = await hre.ethers.getContractFactory("LandTitle");
//   const landTitle = await LandTitle.deploy();

//   await landTitle.waitForDeployment();

//   console.log("✅ LandTitle deployed to:", await landTitle.getAddress());
// }

// main().catch((error) => {
//   console.error(error);
//   process.exit(1);
// });

// // hardhat.config.js
// import "@nomicfoundation/hardhat-toolbox";
// import "dotenv/config";

// export default {
//   solidity: "0.8.28",
//   networks: {
//     localhost: {
//       url: "http://127.0.0.1:8545",
//     },
//     sepolia: {
//       url: process.env.SEPOLIA_RPC_URL,
//       accounts: [process.env.PRIVATE_KEY],
//     },
//   },
// };

// // hardhat.config.cjs
// require("@nomicfoundation/hardhat-toolbox");
// require("dotenv").config();

// module.exports = {
//   solidity: "0.8.20",
//   networks: {
//     localhost: {
//       url: "http://127.0.0.1:8545",
//     },
//   },
// };