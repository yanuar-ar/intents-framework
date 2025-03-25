// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { BasicSwap7683 } from "./BasicSwap7683.sol";

contract Spoke is BasicSwap7683 {
    constructor(address _permit2) BasicSwap7683(_permit2) { }

    function _dispatchSettle(
        uint32 _originDomain,
        bytes32[] memory _orderIds,
        bytes[] memory _ordersFillerData
    )
        internal
        override
    { }

    function _dispatchRefund(uint32 _originDomain, bytes32[] memory _orderIds) internal override { }

    function _localDomain() internal view override returns (uint32) {
        return uint32(0);
    }
}
