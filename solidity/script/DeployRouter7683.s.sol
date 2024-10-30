// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.25 <0.9.0;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { TypeCasts } from "@hyperlane-xyz/libs/TypeCasts.sol";
import { GasRouter } from "@hyperlane-xyz/client/GasRouter.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import { Router7683 } from "../src/Router7683.sol";

/// @dev See the Solidity Scripting tutorial: https://book.getfoundry.sh/tutorials/solidity-scripting
contract DeployRouter7683 is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PK");

        string memory ROUTER_SALT = vm.envString("ROUTER7683_SALT");
        address mailbox = vm.envAddress("MAILBOX");
        address permit2 = vm.envAddress("PERMIT2");
        address admin = vm.envAddress("PROXY_ADMIN");
        address owner = vm.envAddress("ROUTER_OWNER");
        uint256[] memory domains = vm.envUint("DOMAINS", ",");
        uint32[] memory _domains = new uint32[](domains.length);
        bytes32[] memory routers = new bytes32[](domains.length);
        GasRouter.GasRouterConfig[] memory gasConfigs = new GasRouter.GasRouterConfig[](domains.length);

        vm.startBroadcast(deployerPrivateKey);

        address routerImpl = address(new Router7683{salt: keccak256(abi.encode(ROUTER_SALT))}(mailbox, permit2));
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy{salt: keccak256(abi.encode(ROUTER_SALT))}(
          routerImpl,
          admin,
          abi.encodeWithSelector(Router7683.initialize.selector, address(0), address(0), owner)
        );

        for (uint i = 0; i < domains.length; i++) {
          routers[i] = TypeCasts.addressToBytes32(address(proxy));
          _domains[i] = uint32(domains[i]);
          // amount is based on gas report from tests multiply 2
          gasConfigs[i] = GasRouter.GasRouterConfig(_domains[i], 1070688);
        }

        Router7683(address(proxy)).enrollRemoteRouters(_domains, routers);

        Router7683(address(proxy)).setDestinationGas(gasConfigs);

        vm.stopBroadcast();

        // solhint-disable-next-line no-console
        console2.log("Proxy:", address(proxy));
        console2.log("Implementation:", routerImpl);
    }
}
