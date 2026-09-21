// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DGSSLandRegistry {

    struct Land {
        address owner;
        string hash;
        uint256 timestamp;
        bool exists;
    }

    struct OwnershipRecord {
        address from;
        address to;
        uint256 timestamp;
        string action;
    }

    mapping(uint256 => Land) public lands;
    mapping(uint256 => OwnershipRecord[]) private ownershipHistory;

    event LandStored(uint256 indexed parcelId, address indexed owner);
    event LandSold(uint256 indexed parcelId, address indexed seller, address indexed buyer);
    event LandTransferred(uint256 indexed parcelId, address indexed from, address indexed to);

    function storeLand(uint256 parcelId, string memory hash) public returns (uint256, string memory) {
        require(parcelId > 0, "Invalid parcel id");
        require(!lands[parcelId].exists, "Land already registered");

        lands[parcelId] = Land(msg.sender, hash, block.timestamp, true);
        ownershipHistory[parcelId].push(OwnershipRecord(address(0), msg.sender, block.timestamp, "REGISTER"));
        emit LandStored(parcelId, msg.sender);
        return (parcelId, hash);
    }

    function sellLand(uint256 parcelId, address buyer) public {
        require(lands[parcelId].exists, "Land not registered");
        require(msg.sender == lands[parcelId].owner, "Only owner can sell");
        require(buyer != address(0), "Invalid buyer address");
        require(buyer != lands[parcelId].owner, "Buyer already owns land");

        address seller = lands[parcelId].owner;
        lands[parcelId].owner = buyer;
        lands[parcelId].timestamp = block.timestamp;
        ownershipHistory[parcelId].push(OwnershipRecord(seller, buyer, block.timestamp, "SALE"));

        emit LandSold(parcelId, seller, buyer);
    }

    function transferLand(uint256 parcelId, address newOwner) public {
        require(lands[parcelId].exists, "Land not registered");
        require(msg.sender == lands[parcelId].owner, "Only owner can transfer");
        require(newOwner != address(0), "Invalid new owner address");
        require(newOwner != lands[parcelId].owner, "New owner already owns land");

        address previousOwner = lands[parcelId].owner;
        lands[parcelId].owner = newOwner;
        lands[parcelId].timestamp = block.timestamp;
        ownershipHistory[parcelId].push(OwnershipRecord(previousOwner, newOwner, block.timestamp, "TRANSFER"));

        emit LandTransferred(parcelId, previousOwner, newOwner);
    }

    function getLand(uint256 parcelId)
        public view returns (address, string memory, uint256)
    {
        require(lands[parcelId].exists, "Land not registered");

        Land memory l = lands[parcelId];
        return (l.owner, l.hash, l.timestamp);
    }

    function getOwnershipHistoryCount(uint256 parcelId) public view returns (uint256) {
        require(lands[parcelId].exists, "Land not registered");
        return ownershipHistory[parcelId].length;
    }

    function getOwnershipHistoryRecord(uint256 parcelId, uint256 index)
        public view returns (address from, address to, uint256 timestamp, string memory action)
    {
        require(lands[parcelId].exists, "Land not registered");
        require(index < ownershipHistory[parcelId].length, "History index out of bounds");

        OwnershipRecord memory record = ownershipHistory[parcelId][index];
        return (record.from, record.to, record.timestamp, record.action);
    }
}
