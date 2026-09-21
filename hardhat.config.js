require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      accounts: {
        count: 50, // 👈 Number of accounts you want
        accountsBalance: "10000000000000000000000" // optional: set initial balance
      }
    }
  }
  // networks: {
  //   sepolia: {
  //     url: "https://sepolia.infura.io/v3/bf7c8287c324459a94db76a8ea346c57",
  //     accounts: ["43024554e6175924f37a406ef943aeaa273a93876364701bea6374550257b59c"]
  //   }
  // }
};
