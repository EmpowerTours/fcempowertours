/**
 * Verify contract using Hardhat
 */

const CONTRACT_ADDRESS = '0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c';

// Constructor arguments (exact order from deployment)
const TOURS_TOKEN = '0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B';
const KINTSU = '0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5';
const TOKEN_SWAP = '0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2';
const DRAGON_ROUTER = '0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea';
const KEEPER = '0x37302543aeF0b06202adcb06Db36daB05F8237E9';

console.log('🔍 Verifying EmpowerToursYieldStrategyV2 on Monad Explorer');
console.log('Contract Address:', CONTRACT_ADDRESS);
console.log('');
console.log('Constructor Arguments:');
console.log('  TOURS Token:', TOURS_TOKEN);
console.log('  Kintsu:', KINTSU);
console.log('  TokenSwap:', TOKEN_SWAP);
console.log('  DragonRouter:', DRAGON_ROUTER);
console.log('  Keeper:', KEEPER);
console.log('');
console.log('Run the following command:');
console.log('');
console.log(`npx hardhat verify --network monadTestnet ${CONTRACT_ADDRESS} "${TOURS_TOKEN}" "${KINTSU}" "${TOKEN_SWAP}" "${DRAGON_ROUTER}" "${KEEPER}"`);
console.log('');
