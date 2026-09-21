import { useState } from 'react';
import { ethers } from 'ethers';
import LandTitleABI from '../contracts/LandTitle.json';

function App() {
  const [parcelId, setParcelId] = useState('');
  const [toAddress, setToAddress] = useState('');

  const transfer = async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(
      "process.env.CONTRACT_ADDRESS",
      LandTitleABI.abi,
      signer
    );
    const tx = await contract.transfer(toAddress, parcelId);
    await tx.wait();
    alert("Title transferred successfully!");
  };

  return (
    <div>
      <h1>Blockchain Land Title System</h1>
      <input
        placeholder="Parcel ID"
        value={parcelId}
        onChange={(e) => setParcelId(e.target.value)}
      />
      <input
        placeholder="To Address"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
      />
      <button onClick={transfer}>Transfer Ownership</button>
    </div>
  );
}

export default App;

