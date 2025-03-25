// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.25 <0.9.0;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { Spoke } from "../src/Spoke.sol";

contract DeploySpoke is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(deployerPrivateKey);

        Spoke spoke = new Spoke(address(0));

        vm.stopBroadcast();

        // solhint-disable-next-line no-console
        console2.log("Spoke:", address(spoke));
    }
}
