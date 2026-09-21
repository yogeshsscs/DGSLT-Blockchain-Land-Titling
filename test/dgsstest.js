// const { expect } = require("chai");

// describe("DGSS Gas Test", function () {

//   let contract;

//   before(async function () {
//     const Contract = await ethers.getContractFactory("DGSSLandRegistry");
//     contract = await Contract.deploy(2, 2089, 1044);
//     await contract.waitForDeployment();
//   });

//   it("Measure gas for storing transaction", async function () {

//     const tx = await contract.storeTransaction(
//       ethers.keccak256(ethers.toUtf8Bytes("LAND123")),
//       10, 1024, 5, 3
//     );

//     const receipt = await tx.wait();

//     console.log("Gas used:", receipt.gasUsed.toString());
//   });
// });

const hre = require("hardhat");

async function main() {

  const { ethers } = hre;

  // Deploy contract
  const Contract = await ethers.getContractFactory("DGSSLandRegistry");
  const contract = await Contract.deploy();
  //await contract.waitForDeployment();

  console.log("Contract deployed at:", await contract.address);

  // Execute transaction
  const tx = await contract.storeTransaction(
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("LAND123")),
    10, 1024, 5, 1
  );

  const receipt = await tx.wait();

  console.log("Gas used:", receipt.gasUsed.toString());
}

// Run script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });