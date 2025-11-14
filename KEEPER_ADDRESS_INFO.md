# KEEPER Address Information

## What is KEEPER?

The `keeper` address in the YieldStrategy contract has permission to call the `harvest()` function to automate yield collection. It uses the `onlyKeeperOrOwner` modifier.

```solidity
modifier onlyKeeperOrOwner() {
    require(msg.sender == keeper || msg.sender == owner(), "Not authorized");
    _;
}

function harvest() external onlyKeeperOrOwner nonReentrant returns (uint256 yieldTours) {
    // Harvests yield from Kintsu
}
```

## Address Discrepancy

### In Deployment Script (`scripts/deploy-v2-contract.mjs`)
```javascript
const KEEPER = getAddress('0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9');
```

### Actually Deployed Contract (`0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c`)
```
KEEPER: 0x37302543aeF0b06202adcb06Db36daB05F8237E9
```

## Why the Difference?

The contract was deployed **20 days ago** with a different KEEPER address than what's in the deployment script. This means:

1. **Someone manually changed the constructor args** during deployment
2. OR the deployment script was updated later but the contract wasn't redeployed
3. OR there was a different deployment script used

## Impact

- The KEEPER address in the deployed contract can call `harvest()`
- The owner can also call `harvest()` (and all owner functions)
- The KEEPER can be updated by the owner using `setKeeper(address newKeeper)`

## Current State

- **Deployed V2 Contract:** Uses `0x37302543aeF0b06202adcb06Db36daB05F8237E9` as keeper
- **Deployment Script:** References `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9`

**For verification of the deployed contract, MUST use:** `0x37302543aeF0b06202adcb06Db36daB05F8237E9`
