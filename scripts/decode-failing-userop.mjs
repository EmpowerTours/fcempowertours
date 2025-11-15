/**
 * Decode the failing UserOperation from the error logs to understand what's happening
 */
import { decodeAbiParameters, parseAbi, decodeFunctionData } from 'viem';

// From the error logs - the actual callData that's failing
const callData = '0x541d63c80000000000000000000000009641d764fc13c8b624c04430c7356c1c7c8102e200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000001c48d80ff0a0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000017200a123600c82e69cb311b0e068b06bfa9f787699b700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b30000000000000000000000002804add55b205ce5930d7807ad6183d8f33459740000000000000000000000000000000000000000000000056bc75e2d63100000002804add55b205ce5930d7807ad6183d8f334597400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084a48999b600000000000000000000000054e935c5f1ec987bb87f36fc046cf13fb393acc800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000056bc75e2d6310000000000000000000000000000033ffccb1802e13a7eead232bcd4706a2269582b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

console.log('🔍 DECODING FAILING USEROPERATION\n');
console.log('CallData length:', callData.length, 'characters');
console.log('');

// The callData is to the Safe's executeBatch function
// Signature: executeBatch(address[] calldata to, uint256[] calldata value, bytes[] calldata data, uint8 operation)
const safeAbi = parseAbi([
  'function executeBatch(address[] calldata to, uint256[] calldata value, bytes[] calldata data, uint8 operation) external'
]);

try {
  const decoded = decodeFunctionData({
    abi: safeAbi,
    data: callData,
  });

  console.log('Function:', decoded.functionName);
  console.log('');

  const [targets, values, datas, operation] = decoded.args;

  console.log('Number of calls in batch:', targets.length);
  console.log('Operation type:', operation, '(0 = Call, 1 = DelegateCall)');
  console.log('');

  // Decode each call
  for (let i = 0; i < targets.length; i++) {
    console.log(`Call ${i}:`);
    console.log('  Target:', targets[i]);
    console.log('  Value:', values[i].toString(), 'wei');
    console.log('  Data:', datas[i]);
    console.log('');

    // Try to decode the function call
    const selector = datas[i].slice(0, 10);
    console.log('  Function selector:', selector);

    if (selector === '0x095ea7b3') {
      // approve(address spender, uint256 amount)
      const approveAbi = parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']);
      try {
        const approveDecoded = decodeFunctionData({
          abi: approveAbi,
          data: datas[i],
        });
        console.log('  Function: approve');
        console.log('  Spender:', approveDecoded.args[0]);
        console.log('  Amount:', (Number(approveDecoded.args[1]) / 1e18).toFixed(2), 'TOURS');
      } catch (e) {
        console.log('  Could not decode approve data');
      }
    } else if (selector === '0xa48999b6') {
      // stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary)
      const stakeAbi = parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']);
      try {
        const stakeDecoded = decodeFunctionData({
          abi: stakeAbi,
          data: datas[i],
        });
        console.log('  Function: stakeWithNFT');
        console.log('  NFT Address:', stakeDecoded.args[0]);
        console.log('  NFT Token ID:', stakeDecoded.args[1].toString());
        console.log('  TOURS Amount:', (Number(stakeDecoded.args[2]) / 1e18).toFixed(2), 'TOURS');
        console.log('  Beneficiary:', stakeDecoded.args[3]);
      } catch (e) {
        console.log('  Could not decode stakeWithNFT data');
      }
    } else {
      console.log('  Unknown function');
    }

    console.log('');
  }

  console.log('='.repeat(70));
  console.log('\nANALYSIS:');
  console.log('');
  console.log('The UserOperation is calling Safe.executeBatch() with 2 calls:');
  console.log('1. TOURS.approve(YieldStrategy, 100 TOURS)');
  console.log('2. YieldStrategy.stakeWithNFT(PassportNFT, tokenId=1, 100 TOURS, beneficiary)');
  console.log('');
  console.log('If this is failing with "reason: 0x", the issue is likely:');
  console.log('');
  console.log('A. Safe validation is failing (signature, nonce, etc.)');
  console.log('   - Check that the Safe account is properly configured for ERC-4337');
  console.log('   - Verify the fallback handler is set correctly');
  console.log('   - Check that the module allowing executeBatch is enabled');
  console.log('');
  console.log('B. Gas estimation parameters are insufficient');
  console.log('   - The verificationGasLimit might be too low for Safe signature validation');
  console.log('   - The callGasLimit might be too low for the batch execution');
  console.log('');
  console.log('C. EntryPoint validation is failing');
  console.log('   - Check that the EntryPoint v0.7 is deployed correctly');
  console.log('   - Verify the Safe has sufficient MON for gas fees');
  console.log('   - Check the nonce is valid');
  console.log('');

} catch (e) {
  console.error('Failed to decode:', e.message);
}
