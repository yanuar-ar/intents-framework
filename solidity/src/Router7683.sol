// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { GasRouter } from "@hyperlane-xyz/client/GasRouter.sol";

import { Base7683 } from "./Base7683.sol";
import { OrderData, OrderEncoder } from "./libs/OrderEncoder.sol";

contract Router7683 is GasRouter, Base7683 {
    // ============ Libraries ============

    // ============ Constants ============

    // ============ Public Storage ============

    // ============ Upgrade Gap ============

    uint256[47] private __GAP;

    // ============ Events ============

    // ============ Errors ============

    // ============ Modifiers ============

    // ============ Constructor ============

    constructor(address _mailbox, address _permit2) GasRouter(_mailbox) Base7683(_permit2) { }

    // ============ Initializers ============

    /**
     * @notice Initializes the contract with HyperlaneConnectionClient contracts
     * @param _customHook used by the Router to set the hook to override with
     * @param _interchainSecurityModule The address of the local ISM contract
     * @param _owner The address with owner privileges
     */
    function initialize(address _customHook, address _interchainSecurityModule, address _owner) external initializer {
        _MailboxClient_initialize(_customHook, _interchainSecurityModule, _owner);
    }

    // ============ External Functions ============

    // TODO - implement interchain settlement functions

    // ============ Internal Functions ============

    function _handle(uint32 _origin, bytes32 _sender, bytes calldata _message) internal virtual override {
        // TODO - handle settlement
    }

    function _handleSettlement(bytes32[] memory _orderIds, bytes32[] memory _receivers) internal virtual override {}

    function _handleRefund(bytes32[] memory _orderIds) internal virtual override {}


    function _mustHaveRemoteCounterpart(uint32 _domain) internal view virtual override returns (bytes32) {
        return _mustHaveRemoteRouter(_domain);
    }

    function _localDomain() internal view override returns (uint32) {
        return localDomain;
    }
}
